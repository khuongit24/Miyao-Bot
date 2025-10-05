import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { createTrackAddedEmbed, createPlaylistAddedEmbed, createErrorEmbed, createNowPlayingEmbed, createInfoEmbed, createSearchConfirmEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { createNowPlayingButtons, createSearchResultButtons, createSearchConfirmButtons } from '../../UI/components/MusicControls.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { 
    UserNotInVoiceError, 
    VoiceChannelPermissionError, 
    DifferentVoiceChannelError,
    NoSearchResultsError 
} from '../utils/errors.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../utils/resilience.js';
import { CircuitBreakerError } from '../utils/CircuitBreaker.js';
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
            // Check if music system is available (graceful degradation)
            if (!isMusicSystemAvailable(client.musicManager)) {
                const degradedMessage = getDegradedModeMessage('phát nhạc');
                const embed = new EmbedBuilder()
                    .setColor(degradedMessage.color)
                    .setTitle(degradedMessage.title)
                    .setDescription(degradedMessage.description)
                    .addFields(degradedMessage.fields)
                    .setTimestamp(degradedMessage.timestamp);
                
                return await interaction.editReply({ embeds: [embed] });
            }
            
            const query = interaction.options.getString('query');
            const member = interaction.member;
            const voiceChannel = member.voice.channel;
            
            // Check if user is in voice channel
            if (!voiceChannel) {
                throw new UserNotInVoiceError();
            }
            
            // Check bot permissions
            const permissions = voiceChannel.permissionsFor(interaction.client.user);
            if (!permissions.has(['Connect', 'Speak'])) {
                throw new VoiceChannelPermissionError(voiceChannel.name);
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
                throw new DifferentVoiceChannelError();
            }
            
            // Search for tracks
            const result = await client.musicManager.search(query, interaction.user);
            
            if (!result || !result.tracks || result.tracks.length === 0) {
                throw new NoSearchResultsError(query);
            }
            
            // If query isn't a URL and result is a search with many tracks, show confirmation for first track
            const isUrl = /^https?:\/\//.test(query);
            if (!isUrl && result.loadType === 'search' && result.tracks.length > 0) {
                const choices = result.tracks.slice(0, 5);
                const firstTrack = choices[0];
                
                // Save choices in memory to resolve on button click
                if (!client._lastSearchResults) client._lastSearchResults = new Map();
                const key = `${interaction.user.id}:${interaction.guildId}`;
                client._lastSearchResults.set(key, { tracks: choices, createdAt: Date.now() });
                
                // Show confirmation embed for the first track
                await interaction.editReply({
                    embeds: [createSearchConfirmEmbed(firstTrack, client.config)],
                    components: createSearchConfirmButtons(firstTrack)
                });
                logger.command('play-search-confirm', interaction.user.id, interaction.guildId);
                return; // Wait for button selection
            }

            // Handle different result types
            if (result.loadType === 'playlist') {
                // Add requester to all tracks
                result.tracks.forEach(track => {
                    track.requester = interaction.user.id;
                });
                
                // Add all tracks from playlist
                queue.add(result.tracks);
                
                // Track metrics
                if (client.metrics) {
                    client.metrics.trackMusic('playlist_added', { trackCount: result.tracks.length });
                }
                
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
                track.requester = interaction.user.id;
                queue.add(track);
                
                // Track metrics
                if (client.metrics) {
                    client.metrics.trackMusic('track_added');
                }
                
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
            // Handle circuit breaker errors with specific message
            if (error instanceof CircuitBreakerError) {
                const degradedMessage = getDegradedModeMessage('tìm kiếm nhạc');
                degradedMessage.description = 'Hệ thống tìm kiếm nhạc đang quá tải hoặc không khả dụng.\n\n' +
                    'Chúng tôi đang tự động khắc phục. Vui lòng thử lại sau 1-2 phút.';
                
                const embed = new EmbedBuilder()
                    .setColor(degradedMessage.color)
                    .setTitle(degradedMessage.title)
                    .setDescription(degradedMessage.description)
                    .addFields(degradedMessage.fields)
                    .setTimestamp(degradedMessage.timestamp);
                
                return await interaction.editReply({ embeds: [embed] });
            }
            
            logger.error('Play command error', error);
            await sendErrorResponse(interaction, error, client.config);
        }
    }
};
