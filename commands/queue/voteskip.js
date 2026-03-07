import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { COLORS } from '../../config/design-system.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { requireCurrentTrack } from '../../middleware/queueCheck.js';
import { UserNotInVoiceError, DifferentVoiceChannelError } from '../../utils/errors.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
import logger from '../../utils/logger.js';
import { getVoteSkipManager } from '../../services/VoteSkipManager.js';

export default {
    data: new SlashCommandBuilder().setName('voteskip').setDescription('Bỏ phiếu để bỏ qua bài hiện tại'),

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
            const { queue } = requireCurrentTrack(client.musicManager, interaction.guildId);

            const member = interaction.member;
            if (!member.voice.channel) {
                throw new UserNotInVoiceError();
            }
            if (member.voice.channel.id !== queue.voiceChannelId) {
                throw new DifferentVoiceChannelError();
            }

            const voiceChannel = member.voice.channel;

            // Get members in voice channel (exclude bots)
            const voiceMembers = voiceChannel.members.filter(m => !m.user.bot);
            const requiredVotes = Math.floor(voiceMembers.size / 2) + 1;

            const manager = getVoteSkipManager();

            // Check for existing session
            let session = manager.getSession(interaction.guildId);

            // Invalidate session if track changed
            if (session && session.trackUri !== queue.current?.info?.uri) {
                manager.clearSession(interaction.guildId);
                session = null;
            }

            if (!session) {
                // Create new session with 30s auto-expiry
                // FIX-CMD-C01: Use optional chaining on queue.current throughout
                session = manager.createSession(interaction.guildId, {
                    trackUri: queue.current?.info?.uri,
                    trackTitle: queue.current?.info?.title || 'Unknown',
                    initiatorId: interaction.user.id,
                    requiredVotes,
                    expiresIn: 30000
                });
            } else {
                // Add vote to existing session
                if (session.votes.has(interaction.user.id)) {
                    return interaction.editReply({
                        content: '❌ Bạn đã bỏ phiếu rồi!'
                    });
                }
                manager.addVote(interaction.guildId, interaction.user.id);
            }

            const currentVotes = session.votes.size;

            // Check if vote threshold reached
            if (currentVotes >= requiredVotes) {
                manager.clearSession(interaction.guildId);

                const skippedTitle = queue.current?.info?.title || 'Unknown';
                await queue.skip();

                const embed = new EmbedBuilder()
                    .setColor(COLORS.SUCCESS)
                    .setTitle('⏭️ Bỏ Qua Thành Công')
                    .setDescription(`**${skippedTitle}** đã được bỏ qua bởi bình chọn!`)
                    .addFields({
                        name: '🗳️ Kết quả',
                        value: `${currentVotes}/${requiredVotes} phiếu`,
                        inline: true
                    })
                    .setFooter({ text: client.config.bot.footer })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                logger.command('voteskip-success', interaction.user.id, interaction.guildId);
                return;
            }

            // Show voting progress
            const embed = new EmbedBuilder()
                .setColor(COLORS.WARNING)
                .setTitle('🗳️ Bỏ Phiếu Để Bỏ Qua')
                .setDescription(`**${session.trackTitle}**`)
                .addFields(
                    {
                        name: '📊 Tiến độ',
                        value: `${currentVotes}/${requiredVotes} phiếu`,
                        inline: true
                    },
                    {
                        name: '⏱️ Thời gian còn lại',
                        value: '30 giây',
                        inline: true
                    }
                )
                .setFooter({ text: `${client.config.bot.footer} • Bỏ phiếu hết hạn sau 30 giây` })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('voteskip_vote')
                    .setLabel(`Bỏ phiếu (${currentVotes}/${requiredVotes})`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⏭️')
            );

            await interaction.editReply({ embeds: [embed], components: [row] });
            logger.command('voteskip-started', interaction.user.id, interaction.guildId, {
                votes: currentVotes,
                required: requiredVotes
            });
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};

// Export for button handler — delegates to shared VoteSkipManager
export function getVoteSkipSession(guildId, _trackUri) {
    return getVoteSkipManager().getSession(guildId);
}

export function addVoteSkipVote(guildId, _trackUri, userId) {
    return getVoteSkipManager().addVote(guildId, userId);
}

export function deleteVoteSkipSession(guildId, _trackUri) {
    return getVoteSkipManager().clearSession(guildId);
}
