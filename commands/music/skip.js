import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { requireCurrentTrack } from '../../middleware/queueCheck.js';
import { UserNotInVoiceError, DifferentVoiceChannelError } from '../../utils/errors.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
import GuildSettings from '../../database/models/GuildSettings.js';
import { COLORS } from '../../config/design-system.js';
import logger from '../../utils/logger.js';
import { detectInstantSkip, sendInstantSkipPrompt } from '../../events/autoPlaySuggestionHandler.js';
import { getAutoPlayPreferenceService } from '../../services/AutoPlayPreferenceService.js';
import { getVoteSkipManager } from '../../services/VoteSkipManager.js';

export default {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Bỏ qua bài hát hiện tại')
        .addBooleanOption(option =>
            option.setName('force').setDescription('Bỏ qua không cần vote (Admin/DJ)').setRequired(false)
        ),

    async execute(interaction, client) {
        try {
            await interaction.deferReply();
            // Check resilience
            if (!isMusicSystemAvailable(client.musicManager)) {
                return sendErrorResponse(
                    interaction,
                    new Error(getDegradedModeMessage('nhạc').description),
                    client.config
                );
            }

            // Use middleware
            const { queue, current } = requireCurrentTrack(client.musicManager, interaction.guildId);

            // Check if user is in the same voice channel
            const member = interaction.member;
            if (!member.voice.channel) {
                throw new UserNotInVoiceError();
            }
            if (member.voice.channel.id !== queue.voiceChannelId) {
                throw new DifferentVoiceChannelError();
            }

            const forceSkip = interaction.options.getBoolean('force') || false;
            const guildSettings = GuildSettings.get(interaction.guildId);

            // Check if vote skip is enabled
            if (guildSettings.voteSkipEnabled && !forceSkip) {
                // Check if user can bypass vote skip (Admin, DJ, or song requester)
                const canBypass = await canBypassVoteSkip(interaction, queue, guildSettings);

                if (!canBypass) {
                    // Start or join vote skip
                    return await handleVoteSkip(interaction, client, queue, guildSettings);
                }
            }

            // Force skip check
            if (forceSkip) {
                const canForce = await canBypassVoteSkip(interaction, queue, guildSettings);
                if (!canForce) {
                    return interaction.editReply({
                        embeds: [
                            createErrorEmbed(
                                'Bạn không có quyền force skip! Chỉ Admin, DJ, hoặc người yêu cầu bài hát mới có thể force skip.',
                                client.config
                            )
                        ]
                    });
                }
            }

            // Clear any existing vote skip session
            getVoteSkipManager().clearSession(interaction.guildId);

            const skippedTrack = current?.info?.title || 'Unknown Track';

            // Skip
            await queue.skip();

            await interaction.editReply({
                embeds: [createSuccessEmbed('Đã bỏ qua', `Đã bỏ qua **${skippedTrack}**`, client.config)]
            });

            logger.command('skip', interaction.user.id, interaction.guildId);

            // Confidence feedback loop: detect instant skips for auto-play preferences
            try {
                const trackUrl = current?.info?.uri || '';
                const userId = interaction.user.id;
                const isInstantSkip = trackUrl ? detectInstantSkip(userId, trackUrl) : null;
                if (isInstantSkip) {
                    const result = await getAutoPlayPreferenceService().recordInstantSkip(userId, trackUrl);
                    if (result.autoDisabled) {
                        sendInstantSkipPrompt(
                            interaction.channel,
                            userId,
                            { url: trackUrl, title: current?.info?.title || 'Unknown' },
                            client.config
                        ).catch(() => {});
                    }
                }
            } catch (skipDetectError) {
                logger.debug('skip', `Instant skip detection error: ${skipDetectError.message}`);
            }
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    },

    // Export for button handler
    canBypassVoteSkip,
    handleVoteSkipButton
};

// Named exports for static imports
export { handleVoteSkipButton, canBypassVoteSkip };

/**
 * Check if user can bypass vote skip
 * FIX-CMD-C01: Added null safety on queue.current
 */
async function canBypassVoteSkip(interaction, queue, guildSettings) {
    const member = interaction.member;

    // Admin can always bypass
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }

    // Check if user has DJ role
    if (guildSettings.djRoleId) {
        if (member.roles.cache.has(guildSettings.djRoleId)) {
            return true;
        }
    }

    // Song requester can skip their own request
    // FIX-CMD-C01: Guard against null queue.current (track can end between check and execution)
    if (queue.current?.requester === interaction.user.id) {
        return true;
    }

    // Check if only one non-bot user in voice channel (no need to vote)
    const voiceChannel = interaction.guild.channels.cache.get(queue.voiceChannelId);
    if (voiceChannel) {
        const membersCount = voiceChannel.members.filter(m => !m.user.bot).size;
        if (membersCount <= 1) {
            return true;
        }
    }

    return false;
}

/**
 * Handle vote skip process
 */
async function handleVoteSkip(interaction, client, queue, guildSettings) {
    const voiceChannel = interaction.guild.channels.cache.get(queue.voiceChannelId);
    const membersInVoice = voiceChannel.members.filter(m => !m.user.bot).size;

    // Calculate required votes
    const requiredPercentage = guildSettings.voteSkipPercentage || 50;
    const requiredVotes = Math.ceil(membersInVoice * (requiredPercentage / 100));

    const manager = getVoteSkipManager();

    // Check for existing session
    let session = manager.getSession(interaction.guildId);

    if (session) {
        // Check if session is still valid (same track)
        // FIX-CMD-C01: Use optional chaining on queue.current
        if (session.trackUri !== queue.current?.info?.uri) {
            // New track, reset session
            session = null;
            manager.clearSession(interaction.guildId);
        }
    }

    if (!session) {
        // Create new vote skip session
        session = manager.createSession(interaction.guildId, {
            trackUri: queue.current?.info?.uri || '',
            trackTitle: queue.current?.info?.title || 'Unknown Track',
            initiatorId: interaction.user.id,
            requiredVotes
        });
    } else {
        // Add vote
        if (session.votes.has(interaction.user.id)) {
            return interaction.editReply({
                embeds: [createErrorEmbed('Bạn đã vote skip rồi!', client.config)]
            });
        }
        session.votes.add(interaction.user.id);
    }

    // Update required votes (in case members joined/left)
    session.requiredVotes = requiredVotes;

    // Check if enough votes
    if (session.votes.size >= session.requiredVotes) {
        manager.clearSession(interaction.guildId);

        const skippedTrack = queue.current?.info?.title || 'Unknown Track';
        await queue.skip();

        const successEmbed = new EmbedBuilder()
            .setColor(client.config.bot.color)
            .setTitle('⏭️ Vote Skip Thành Công!')
            .setDescription(`Đã bỏ qua **${skippedTrack}**\n└ ${session.votes.size}/${session.requiredVotes} phiếu bầu`)
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();

        return interaction.editReply({ embeds: [successEmbed] });
    }

    // Create vote skip embed with button
    const embed = new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle('🗳️ Vote Skip')
        .setDescription(
            `**${session.trackTitle}**\n\n` +
                `📊 **Tiến độ:** ${session.votes.size}/${session.requiredVotes} phiếu\n` +
                `👥 **Thành viên trong voice:** ${membersInVoice}\n` +
                `📈 **Yêu cầu:** ${requiredPercentage}% phiếu bầu\n\n` +
                '*Nhấn nút bên dưới để vote skip!*'
        )
        .setFooter({ text: 'Vote sẽ hết hạn khi bài hát kết thúc' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('vote_skip')
            .setLabel(`Vote Skip (${session.votes.size}/${session.requiredVotes})`)
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Primary)
    );

    const reply = await interaction.editReply({ embeds: [embed], components: [row] });
    session.messageId = reply.id;
}

/**
 * Handle vote skip button interaction
 */
async function handleVoteSkipButton(interaction, client) {
    try {
        const queue = client.musicManager.getQueue(interaction.guildId);

        if (!queue || !queue.current) {
            return interaction.reply({
                embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
                ephemeral: true
            });
        }

        const member = interaction.member;
        if (!member.voice.channel || member.voice.channel.id !== queue.voiceChannelId) {
            return interaction.reply({
                embeds: [createErrorEmbed('Bạn phải ở trong cùng voice channel với bot!', client.config)],
                ephemeral: true
            });
        }

        const manager = getVoteSkipManager();
        const session = manager.getSession(interaction.guildId);

        if (!session || session.trackUri !== queue.current?.info?.uri) {
            return interaction.reply({
                embeds: [createErrorEmbed('Phiên vote skip này đã hết hạn!', client.config)],
                ephemeral: true
            });
        }

        if (session.votes.has(interaction.user.id)) {
            return interaction.reply({
                embeds: [createErrorEmbed('Bạn đã vote skip rồi!', client.config)],
                ephemeral: true
            });
        }

        // Add vote
        session.votes.add(interaction.user.id);

        // Recalculate required votes
        const voiceChannel = interaction.guild.channels.cache.get(queue.voiceChannelId);
        const membersInVoice = voiceChannel.members.filter(m => !m.user.bot).size;
        const guildSettings = GuildSettings.get(interaction.guildId);
        const requiredPercentage = guildSettings.voteSkipPercentage || 50;
        session.requiredVotes = Math.ceil(membersInVoice * (requiredPercentage / 100));

        // Check if enough votes
        if (session.votes.size >= session.requiredVotes) {
            manager.clearSession(interaction.guildId);

            const skippedTrack = queue.current?.info?.title || 'Unknown Track';
            await queue.skip();

            const successEmbed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle('⏭️ Vote Skip Thành Công!')
                .setDescription(
                    `Đã bỏ qua **${skippedTrack}**\n└ ${session.votes.size}/${session.requiredVotes} phiếu bầu`
                )
                .setFooter({ text: client.config.bot.footer })
                .setTimestamp();

            return interaction.update({ embeds: [successEmbed], components: [] });
        }

        // Update embed with new vote count
        const embed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle('🗳️ Vote Skip')
            .setDescription(
                `**${session.trackTitle}**\n\n` +
                    `📊 **Tiến độ:** ${session.votes.size}/${session.requiredVotes} phiếu\n` +
                    `👥 **Thành viên trong voice:** ${membersInVoice}\n` +
                    `📈 **Yêu cầu:** ${requiredPercentage}% phiếu bầu\n\n` +
                    '*Nhấn nút bên dưới để vote skip!*'
            )
            .setFooter({ text: 'Vote sẽ hết hạn khi bài hát kết thúc' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('vote_skip')
                .setLabel(`Vote Skip (${session.votes.size}/${session.requiredVotes})`)
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.update({ embeds: [embed], components: [row] });
    } catch (error) {
        if (error.code === 10062) return;
        logger.error('Error in handleVoteSkipButton', { error: error.message, guildId: interaction.guildId });
        if (!interaction.replied && !interaction.deferred) {
            await interaction
                .reply({
                    embeds: [createErrorEmbed('Đã xảy ra lỗi khi xử lý vote skip!', client.config)],
                    ephemeral: true
                })
                .catch(() => {});
        }
    }
}
