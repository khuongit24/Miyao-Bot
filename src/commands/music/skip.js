import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import GuildSettings from '../../database/models/GuildSettings.js';
import logger from '../../utils/logger.js';

// Store for active vote skip sessions
const voteSkipSessions = new Map();

export default {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Bỏ qua bài hát hiện tại')
        .addBooleanOption(option =>
            option.setName('force')
                .setDescription('Bỏ qua không cần vote (Admin/DJ)')
                .setRequired(false)
        ),
    
    async execute(interaction, client) {
        try {
            const queue = client.musicManager.getQueue(interaction.guildId);
            
            // Check if there's a queue
            if (!queue || !queue.current) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
                    ephemeral: true
                });
            }
            
            // Check if user is in the same voice channel
            const member = interaction.member;
            if (!member.voice.channel || member.voice.channel.id !== queue.voiceChannelId) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Bạn phải ở trong cùng voice channel với bot!', client.config)],
                    ephemeral: true
                });
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
                    return interaction.reply({
                        embeds: [createErrorEmbed('Bạn không có quyền force skip! Chỉ Admin, DJ, hoặc người yêu cầu bài hát mới có thể force skip.', client.config)],
                        ephemeral: true
                    });
                }
            }
            
            // Clear any existing vote skip session
            voteSkipSessions.delete(interaction.guildId);
            
            const skippedTrack = queue.current.info.title;
            
            // Skip
            await queue.skip();
            
            await interaction.reply({
                embeds: [createSuccessEmbed('Đã bỏ qua', `Đã bỏ qua **${skippedTrack}**`, client.config)]
            });
            
            logger.command('skip', interaction.user.id, interaction.guildId);
            
        } catch (error) {
            logger.error('Skip command error', error);
            await interaction.reply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi bỏ qua bài hát!', client.config)],
                ephemeral: true
            });
        }
    },
    
    // Export for button handler
    voteSkipSessions,
    canBypassVoteSkip,
    handleVoteSkipButton
};

/**
 * Check if user can bypass vote skip
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
    if (queue.current.requester === interaction.user.id) {
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
    
    // Check for existing session
    let session = voteSkipSessions.get(interaction.guildId);
    
    if (session) {
        // Check if session is still valid (same track)
        if (session.trackUri !== queue.current.info.uri) {
            // New track, reset session
            session = null;
            voteSkipSessions.delete(interaction.guildId);
        }
    }
    
    if (!session) {
        // Create new vote skip session
        session = {
            trackUri: queue.current.info.uri,
            trackTitle: queue.current.info.title,
            votes: new Set([interaction.user.id]),
            required: requiredVotes,
            createdAt: Date.now(),
            messageId: null
        };
        voteSkipSessions.set(interaction.guildId, session);
    } else {
        // Add vote
        if (session.votes.has(interaction.user.id)) {
            return interaction.reply({
                embeds: [createErrorEmbed('Bạn đã vote skip rồi!', client.config)],
                ephemeral: true
            });
        }
        session.votes.add(interaction.user.id);
    }
    
    // Update required votes (in case members joined/left)
    session.required = requiredVotes;
    
    // Check if enough votes
    if (session.votes.size >= session.required) {
        voteSkipSessions.delete(interaction.guildId);
        
        const skippedTrack = queue.current.info.title;
        await queue.skip();
        
        const successEmbed = new EmbedBuilder()
            .setColor(client.config.bot.color)
            .setTitle('⏭️ Vote Skip Thành Công!')
            .setDescription(`Đã bỏ qua **${skippedTrack}**\n└ ${session.votes.size}/${session.required} phiếu bầu`)
            .setTimestamp();
        
        return interaction.reply({ embeds: [successEmbed] });
    }
    
    // Create vote skip embed with button
    const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('🗳️ Vote Skip')
        .setDescription(
            `**${session.trackTitle}**\n\n` +
            `📊 **Tiến độ:** ${session.votes.size}/${session.required} phiếu\n` +
            `👥 **Thành viên trong voice:** ${membersInVoice}\n` +
            `📈 **Yêu cầu:** ${requiredPercentage}% phiếu bầu\n\n` +
            `*Nhấn nút bên dưới để vote skip!*`
        )
        .setFooter({ text: 'Vote sẽ hết hạn khi bài hát kết thúc' })
        .setTimestamp();
    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('vote_skip')
                .setLabel(`Vote Skip (${session.votes.size}/${session.required})`)
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Primary)
        );
    
    const reply = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
    session.messageId = reply.id;
}

/**
 * Handle vote skip button interaction
 */
async function handleVoteSkipButton(interaction, client) {
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
    
    const session = voteSkipSessions.get(interaction.guildId);
    
    if (!session || session.trackUri !== queue.current.info.uri) {
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
    session.required = Math.ceil(membersInVoice * (requiredPercentage / 100));
    
    // Check if enough votes
    if (session.votes.size >= session.required) {
        voteSkipSessions.delete(interaction.guildId);
        
        const skippedTrack = queue.current.info.title;
        await queue.skip();
        
        const successEmbed = new EmbedBuilder()
            .setColor(client.config.bot.color)
            .setTitle('⏭️ Vote Skip Thành Công!')
            .setDescription(`Đã bỏ qua **${skippedTrack}**\n└ ${session.votes.size}/${session.required} phiếu bầu`)
            .setTimestamp();
        
        return interaction.update({ embeds: [successEmbed], components: [] });
    }
    
    // Update embed with new vote count
    const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('🗳️ Vote Skip')
        .setDescription(
            `**${session.trackTitle}**\n\n` +
            `📊 **Tiến độ:** ${session.votes.size}/${session.required} phiếu\n` +
            `👥 **Thành viên trong voice:** ${membersInVoice}\n` +
            `📈 **Yêu cầu:** ${requiredPercentage}% phiếu bầu\n\n` +
            `*Nhấn nút bên dưới để vote skip!*`
        )
        .setFooter({ text: 'Vote sẽ hết hạn khi bài hát kết thúc' })
        .setTimestamp();
    
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('vote_skip')
                .setLabel(`Vote Skip (${session.votes.size}/${session.required})`)
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Primary)
        );
    
    await interaction.update({ embeds: [embed], components: [row] });
}
