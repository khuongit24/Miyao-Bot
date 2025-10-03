import { SlashCommandBuilder } from 'discord.js';
import { createTrackAddedEmbed, createPlaylistAddedEmbed, createErrorEmbed, createNowPlayingEmbed, createInfoEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { createNowPlayingButtons, createSearchResultButtons } from '../../UI/components/MusicControls.js';
import logger from '../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Phát nhạc từ URL hoặc tìm kiếm')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('URL hoặc từ khóa tìm kiếm')
                .setRequired(true)
        ),
    
    async execute(interaction, client) {
        await interaction.deferReply();
        
        try {
            const query = interaction.options.getString('query');
            const member = interaction.member;
            const voiceChannel = member.voice.channel;
            
            // Check if user is in voice channel
            if (!voiceChannel) {
                return interaction.editReply({
                    embeds: [createErrorEmbed('Bạn phải ở trong voice channel để sử dụng lệnh này!', client.config)]
                });
            }
            
            // Check bot permissions
            const permissions = voiceChannel.permissionsFor(interaction.client.user);
            if (!permissions.has(['Connect', 'Speak'])) {
                return interaction.editReply({
                    embeds: [createErrorEmbed('Bot không có quyền kết nối hoặc nói trong voice channel này!', client.config)]
                });
            }
            
            // Get or create queue
            let queue = client.musicManager.getQueue(interaction.guildId);
            
            if (!queue) {
                queue = await client.musicManager.createQueue(
                    interaction.guildId,
                    voiceChannel.id,
                    interaction.channel
                );
            }
            
            // Check if bot is in different voice channel
            if (queue.voiceChannelId && queue.voiceChannelId !== voiceChannel.id) {
                return interaction.editReply({
                    embeds: [createErrorEmbed('Bot đang phát nhạc ở voice channel khác!', client.config)]
                });
            }
            
            // Search for tracks
            const result = await client.musicManager.search(query, interaction.user);
            
            if (!result || !result.tracks || result.tracks.length === 0) {
                return interaction.editReply({
                    embeds: [createErrorEmbed('Không tìm thấy kết quả nào!', client.config)]
                });
            }
            
            // If query isn't a URL and result is a search with many tracks, let user pick top 5
            const isUrl = /^https?:\/\//.test(query);
            if (!isUrl && result.loadType === 'search' && result.tracks.length > 1) {
                const choices = result.tracks.slice(0, 5);
                // Save choices in memory to resolve on button click
                if (!client._lastSearchResults) client._lastSearchResults = new Map();
                const key = `${interaction.user.id}:${interaction.guildId}`;
                client._lastSearchResults.set(key, { tracks: choices, createdAt: Date.now() });
                const description = choices.map((t, i) => {
                    const title = t.info.title.length > 60 ? t.info.title.substring(0, 57) + '...' : t.info.title;
                    const duration = t.info.isStream ? '🔴 LIVE' : `${Math.round(t.info.length/1000/60) || 0}p`;
                    return `**${i + 1}.** ${title} • ${duration}`;
                }).join('\n');
                
                await interaction.editReply({
                    embeds: [createInfoEmbed('Kết quả tìm kiếm', `Chọn một kết quả bên dưới để phát:\n\n${description}`, client.config)],
                    components: createSearchResultButtons(choices)
                });
                logger.command('play-search', interaction.user.id, interaction.guildId);
                return; // Wait for button selection
            }

            // Handle different result types
            if (result.loadType === 'playlist') {
                // Add all tracks from playlist
                queue.add(result.tracks);
                
                await interaction.editReply({
                    embeds: [createPlaylistAddedEmbed(
                        result.playlistInfo?.name || 'Playlist',
                        result.tracks.length,
                        client.config
                    )]
                });
                
                // Start playing if not already
                if (!queue.current) {
                    await queue.play();
                }
            } else {
                // Add single track (first search result)
                const track = result.tracks[0];
                queue.add(track);
                
                const position = queue.tracks.length;
                
                await interaction.editReply({
                    embeds: [createTrackAddedEmbed(track, position, client.config)]
                });
                
                // Start playing if not already
                if (!queue.current) {
                    await queue.play();
                    
                    // Send now playing with buttons after a short delay
                    setTimeout(async () => {
                        try {
                            const nowPlayingMessage = await interaction.channel.send({
                                embeds: [createNowPlayingEmbed(queue.current, queue, client.config)],
                                components: createNowPlayingButtons(queue, false)
                            });
                            
                            // Store message for auto-updates
                            queue.setNowPlayingMessage(nowPlayingMessage);
                        } catch (error) {
                            logger.error('Failed to send now playing message', error);
                        }
                    }, 1000);
                }
            }
            
            logger.command('play', interaction.user.id, interaction.guildId);
            
        } catch (error) {
            logger.error('Play command error', error);
            
            if (interaction.deferred) {
                await interaction.editReply({
                    embeds: [createErrorEmbed('Đã xảy ra lỗi khi phát nhạc!', client.config)]
                });
            }
        }
    }
};
