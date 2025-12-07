import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import {
    createTrackAddedEmbed,
    createPlaylistAddedEmbed,
    createErrorEmbed,
    createNowPlayingEmbed,
    createInfoEmbed,
    createSearchConfirmEmbed,
    createNoResultsSuggestionsEmbed
} from '../../UI/embeds/MusicEmbeds.js';
import {
    createNowPlayingButtons,
    createSearchResultButtons,
    createSearchConfirmButtons
} from '../../UI/components/MusicControls.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import {
    UserNotInVoiceError,
    VoiceChannelPermissionError,
    DifferentVoiceChannelError,
    NoSearchResultsError
} from '../../utils/errors.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
import { CircuitBreakerError } from '../../utils/CircuitBreaker.js';
import { PLAYLIST_RESOLUTION } from '../../utils/constants.js';
import History from '../../database/models/History.js';
import logger from '../../utils/logger.js';

// URL patterns for different music platforms
const URL_PATTERNS = {
    SPOTIFY_TRACK: /^https?:\/\/(open\.)?spotify\.com\/(intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]+)/,
    SPOTIFY_ALBUM: /^https?:\/\/(open\.)?spotify\.com\/(intl-[a-z]{2}\/)?album\/([a-zA-Z0-9]+)/,
    SPOTIFY_PLAYLIST: /^https?:\/\/(open\.)?spotify\.com\/(intl-[a-z]{2}\/)?playlist\/([a-zA-Z0-9]+)/,
    SPOTIFY_ARTIST: /^https?:\/\/(open\.)?spotify\.com\/(intl-[a-z]{2}\/)?artist\/([a-zA-Z0-9]+)/,
    SOUNDCLOUD: /^https?:\/\/(www\.)?soundcloud\.com\//,
    YOUTUBE: /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//
};

/**
 * Detect the platform and type from a URL
 * @param {string} query - The query or URL
 * @returns {{ platform: string, type: string, isUrl: boolean }}
 */
function detectPlatform(query) {
    if (URL_PATTERNS.SPOTIFY_TRACK.test(query)) {
        return { platform: 'spotify', type: 'track', isUrl: true };
    }
    if (URL_PATTERNS.SPOTIFY_ALBUM.test(query)) {
        return { platform: 'spotify', type: 'album', isUrl: true };
    }
    if (URL_PATTERNS.SPOTIFY_PLAYLIST.test(query)) {
        return { platform: 'spotify', type: 'playlist', isUrl: true };
    }
    if (URL_PATTERNS.SPOTIFY_ARTIST.test(query)) {
        return { platform: 'spotify', type: 'artist', isUrl: true };
    }
    if (URL_PATTERNS.SOUNDCLOUD.test(query)) {
        return { platform: 'soundcloud', type: 'url', isUrl: true };
    }
    if (URL_PATTERNS.YOUTUBE.test(query)) {
        return { platform: 'youtube', type: 'url', isUrl: true };
    }
    if (/^https?:\/\//.test(query)) {
        return { platform: 'unknown', type: 'url', isUrl: true };
    }
    return { platform: 'search', type: 'search', isUrl: false };
}

/**
 * Get platform-specific icon for embeds
 * @param {string} platform - Platform name
 * @returns {string} Emoji icon
 */
function getPlatformEmoji(platform) {
    const emojis = {
        spotify: '🟢',
        soundcloud: '🟠',
        youtube: '🔴',
        unknown: '🔵'
    };
    return emojis[platform] || '🎵';
}

/**
 * Create a text-based progress bar
 * @param {number} percent - Progress percentage (0-100)
 * @param {number} length - Bar length in characters
 * @returns {string} Progress bar string
 */
function createProgressBar(percent, length = 20) {
    const filled = Math.round((percent / 100) * length);
    const empty = length - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Extract potential artist name from search query
 * @param {string} query - The search query
 * @returns {string|null} Potential artist name or null
 */
function extractArtistFromQuery(query) {
    // Common patterns: "artist - song", "song by artist", "artist song"
    const patterns = [
        /^(.+?)\s*-\s*.+$/i, // "Artist - Song"
        /^.+?\s+by\s+(.+)$/i, // "Song by Artist"
        /^(.+?)\s+(official|music|video|audio|lyrics)/i // "Artist official"
    ];

    for (const pattern of patterns) {
        const match = query.match(pattern);
        if (match && match[1]) {
            return match[1].trim();
        }
    }

    // Fallback: take first 1-2 words if query has 3+ words
    const words = query.split(/\s+/);
    if (words.length >= 3) {
        return words.slice(0, 2).join(' ');
    }

    return null;
}

/**
 * Get smart suggestions based on user history and query
 * @param {string} query - The search query that returned no results
 * @param {string} userId - The user ID
 * @param {string} guildId - The guild ID
 * @returns {Promise<Array>} Array of suggestion objects
 */
async function getSmartSuggestions(query, userId, guildId) {
    const suggestions = [];
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

    try {
        // 1. Get user's history and find similar tracks
        const userHistory = History.getUserHistory(userId, 50);

        if (userHistory && userHistory.length > 0) {
            // Find tracks that match any word in the query
            const historyMatches = userHistory
                .filter(entry => {
                    const titleLower = (entry.track_title || '').toLowerCase();
                    const authorLower = (entry.track_author || '').toLowerCase();

                    // Check if any query word is in title or author
                    return queryWords.some(word => titleLower.includes(word) || authorLower.includes(word));
                })
                .slice(0, 3);

            // Add history matches
            historyMatches.forEach(entry => {
                suggestions.push({
                    type: 'history',
                    title: entry.track_title,
                    author: entry.track_author,
                    url: entry.track_url,
                    score: 10 // High priority for history matches
                });
            });
        }

        // 2. Get guild's popular tracks
        const popularTracks = History.getMostPlayed(guildId, 5, 'week');

        if (popularTracks && popularTracks.length > 0) {
            // Filter out already suggested and add some popular tracks
            const existingUrls = new Set(suggestions.map(s => s.url));

            popularTracks.slice(0, 3).forEach(entry => {
                if (!existingUrls.has(entry.track_url)) {
                    suggestions.push({
                        type: 'popular',
                        title: entry.track_title,
                        author: entry.track_author,
                        url: entry.track_url,
                        playCount: entry.play_count,
                        score: 5
                    });
                }
            });
        }

        // 3. Try to extract artist and suggest artist's tracks
        const artistName = extractArtistFromQuery(query);
        if (artistName) {
            const artistLower = artistName.toLowerCase();

            // Look for tracks by this artist in history
            const artistTracks =
                userHistory
                    ?.filter(entry => {
                        const authorLower = (entry.track_author || '').toLowerCase();
                        return authorLower.includes(artistLower);
                    })
                    .slice(0, 3) || [];

            artistTracks.forEach(entry => {
                const existingUrls = new Set(suggestions.map(s => s.url));
                if (!existingUrls.has(entry.track_url)) {
                    suggestions.push({
                        type: 'artist',
                        title: entry.track_title,
                        author: entry.track_author,
                        url: entry.track_url,
                        score: 8
                    });
                }
            });
        }
    } catch (error) {
        logger.debug('Error getting smart suggestions', { error: error.message });
    }

    // Sort by score and return
    return suggestions.sort((a, b) => b.score - a.score);
}

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Phát nhạc từ URL hoặc tìm kiếm')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('URL hoặc từ khóa tìm kiếm (hỗ trợ YouTube, Spotify, SoundCloud)')
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

            // Detect platform and type
            const { platform, type, isUrl } = detectPlatform(query);

            // Log platform detection for debugging
            logger.debug('Play command platform detection', { query: query.substring(0, 50), platform, type, isUrl });

            // Show loading message for Spotify playlists/albums (they can be slow)
            if (platform === 'spotify' && (type === 'playlist' || type === 'album')) {
                const loadingEmbed = new EmbedBuilder()
                    .setColor('#1DB954') // Spotify green
                    .setTitle(
                        `${getPlatformEmoji(platform)} Đang tải ${type === 'playlist' ? 'playlist' : 'album'} từ Spotify...`
                    )
                    .setDescription('Quá trình này có thể mất vài giây, vui lòng đợi...')
                    .setTimestamp();

                await interaction.editReply({ embeds: [loadingEmbed] });
            }

            // Search for tracks
            const result = await client.musicManager.search(query, interaction.user);

            if (!result || !result.tracks || result.tracks.length === 0) {
                // Special error message for Spotify if credentials not configured
                if (platform === 'spotify') {
                    const spotifyError = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Không tìm thấy kết quả từ Spotify')
                        .setDescription(
                            'Không thể tải nhạc từ Spotify. Có thể do:\n\n' +
                                '• Link không hợp lệ hoặc bài hát không tồn tại\n' +
                                '• Spotify API chưa được cấu hình (cần Client ID & Secret)\n' +
                                '• Bài hát bị giới hạn theo khu vực\n\n' +
                                '**Giải pháp:** Thử tìm kiếm bằng tên bài hát thay vì link Spotify'
                        )
                        .setFooter({ text: client.config.bot.footer })
                        .setTimestamp();

                    return await interaction.editReply({ embeds: [spotifyError] });
                }

                // Get smart suggestions for better UX
                const suggestions = await getSmartSuggestions(query, interaction.user.id, interaction.guildId);

                if (suggestions.length > 0) {
                    // Show suggestions embed instead of plain error
                    const suggestionsEmbed = createNoResultsSuggestionsEmbed(query, suggestions, client.config);
                    return await interaction.editReply({ embeds: [suggestionsEmbed] });
                }

                // No suggestions available, throw regular error
                throw new NoSearchResultsError(query);
            }

            // If query isn't a URL and result is a search with many tracks, show confirmation for first track
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
                    client.metrics.trackMusic('playlist_added', {
                        trackCount: result.tracks.length,
                        platform,
                        type
                    });
                }

                // Create appropriate embed based on platform
                const playlistName = result.playlistInfo?.name || 'Playlist';
                const playlistEmbed = new EmbedBuilder()
                    .setColor(platform === 'spotify' ? '#1DB954' : client.config.bot.color)
                    .setTitle(`${getPlatformEmoji(platform)} Đã thêm ${type === 'album' ? 'album' : 'playlist'}`)
                    .setDescription(`📝 **${playlistName}**`)
                    .addFields([
                        {
                            name: '🎵 Số bài',
                            value: `${result.tracks.length} bài`,
                            inline: true
                        },
                        {
                            name: '📍 Nguồn',
                            value: platform.charAt(0).toUpperCase() + platform.slice(1),
                            inline: true
                        }
                    ])
                    .setFooter({ text: client.config.bot.footer })
                    .setTimestamp();

                // Add thumbnail if available
                if (result.playlistInfo?.artworkUrl) {
                    playlistEmbed.setThumbnail(result.playlistInfo.artworkUrl);
                }

                await interaction.editReply({ embeds: [playlistEmbed] });

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
                    client.metrics.trackMusic('track_added', { platform });
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

            logger.command('play', interaction.user.id, interaction.guildId, { platform, type });
        } catch (error) {
            // Handle circuit breaker errors with specific message
            if (error instanceof CircuitBreakerError) {
                const degradedMessage = getDegradedModeMessage('tìm kiếm nhạc');
                degradedMessage.description =
                    'Hệ thống tìm kiếm nhạc đang quá tải hoặc không khả dụng.\n\n' +
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
