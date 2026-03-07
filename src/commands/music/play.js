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
import { PLAYLIST_RESOLUTION, SEARCH_PREFIXES } from '../../utils/constants.js';
import { detectPlatform, getPlatformEmoji, getSmartSuggestions } from '../../utils/musicUtils.js';
import { COLORS } from '../../config/design-system.js';
import { checkAutoPlayFromResults, markAutoPlayed } from '../../events/autoPlaySuggestionHandler.js';
import logger from '../../utils/logger.js';

/**
 * Normalize search query for better cache hit rates
 * @param {string} query - Raw search query
 * @returns {string} Normalized query
 */
function normalizeSearchQuery(query) {
    if (!query) return '';
    const trimmed = query.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return trimmed.toLowerCase().replace(/\s+/g, ' '); // Collapse multiple spaces
}

// --- Helpers ---

/**
 * Truncate a title string for embed display.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncateTitle(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen - 1) + '…' : str;
}

async function handleDegradedMode(interaction) {
    const degradedMessage = getDegradedModeMessage('phát nhạc');
    const embed = new EmbedBuilder()
        .setColor(degradedMessage.color)
        .setTitle(degradedMessage.title)
        .setDescription(degradedMessage.description)
        .addFields(degradedMessage.fields)
        .setFooter({ text: interaction.client.config.bot.footer })
        .setTimestamp(degradedMessage.timestamp);
    return interaction.editReply({ embeds: [embed] });
}

function validateVoicePermissions(interaction) {
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) throw new UserNotInVoiceError();

    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions.has(['ViewChannel', 'Connect', 'Speak'])) {
        throw new VoiceChannelPermissionError(voiceChannel.name);
    }
    return voiceChannel;
}

async function getOrCreateQueue(client, interaction, voiceChannel) {
    let queue = client.musicManager.getQueue(interaction.guildId);
    if (!queue) {
        queue = await client.musicManager.createQueue(interaction.guildId, voiceChannel.id, interaction.channel);
    }

    if (queue.voiceChannelId && queue.voiceChannelId !== voiceChannel.id) {
        throw new DifferentVoiceChannelError();
    }
    return queue;
}

async function handleSpotifyLoading(interaction, platform, type) {
    if (platform === 'spotify' && (type === 'playlist' || type === 'album')) {
        const loadingEmbed = new EmbedBuilder()
            .setColor(COLORS.PRIMARY)
            .setTitle(
                `${getPlatformEmoji(platform)} Đang tải ${type === 'playlist' ? 'playlist' : 'album'} từ Spotify...`
            )
            .setDescription('Quá trình này có thể mất vài giây, vui lòng đợi...')
            .setFooter({ text: interaction.client.config.bot.footer })
            .setTimestamp();
        await interaction.editReply({ embeds: [loadingEmbed] });
    }
}

async function handleNoResults(interaction, client, query, platform) {
    if (platform === 'spotify') {
        const spotifyError = new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle('❌ Không tìm thấy kết quả từ Spotify')
            .setDescription('Không thể tải nhạc từ Spotify. Thử tìm kiếm bằng tên bài hát.')
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp();
        return interaction.editReply({ embeds: [spotifyError] });
    }

    const suggestions = await getSmartSuggestions(query, interaction.user.id, interaction.guildId);
    if (suggestions.length > 0) {
        const suggestionsEmbed = createNoResultsSuggestionsEmbed(query, suggestions, client.config);
        return interaction.editReply({ embeds: [suggestionsEmbed] });
    }

    throw new NoSearchResultsError(query);
}

const SEARCH_RESULTS_TTL = 5 * 60 * 1000; // 5 minutes
const SEARCH_RESULTS_MAX_SIZE = 100;

async function handleSearchConfirmation(interaction, client, firstTrack, choices) {
    const key = `${interaction.user.id}:${interaction.guildId}`;
    if (client.cacheManager) {
        client.cacheManager.set('searchResults', key, { tracks: choices, createdAt: Date.now() }, SEARCH_RESULTS_TTL);
    } else {
        if (!client._lastSearchResults) client._lastSearchResults = new Map();

        // Evict expired entries and enforce size limit
        const now = Date.now();
        for (const [k, v] of client._lastSearchResults) {
            if (now - v.createdAt > SEARCH_RESULTS_TTL) {
                client._lastSearchResults.delete(k);
            }
        }
        if (client._lastSearchResults.size >= SEARCH_RESULTS_MAX_SIZE) {
            const oldestKey = client._lastSearchResults.keys().next().value;
            client._lastSearchResults.delete(oldestKey);
        }

        client._lastSearchResults.set(key, { tracks: choices, createdAt: Date.now() });
        setTimeout(() => client._lastSearchResults.delete(key), 120_000);
    }

    const reply = await interaction.editReply({
        embeds: [createSearchConfirmEmbed(firstTrack, client.config)],
        components: createSearchConfirmButtons(firstTrack)
    });

    // BUG-067: Disable buttons after timeout
    setTimeout(async () => {
        try {
            // Clean up cached search results
            if (client.cacheManager) {
                client.cacheManager.delete?.('searchResults', key);
            } else {
                client._lastSearchResults?.delete(key);
            }

            await reply.edit({ components: [] }).catch(() => {});
        } catch {
            // Message may have been deleted or interaction expired
        }
    }, SEARCH_RESULTS_TTL);

    logger.command('play-search-confirm', interaction.user.id, interaction.guildId);
}

async function handlePlaylistResult({ interaction, client, queue, result, platform, type, searchInfo }) {
    result.tracks.forEach(t => (t.requester = interaction.user.id));
    queue.add(result.tracks);

    if (client.metrics) {
        client.metrics.trackMusic('playlist_added', { trackCount: result.tracks.length, platform, type });
    }

    const playlistName = result.playlistInfo?.name || 'Playlist';
    const playlistEmbed = new EmbedBuilder()
        .setColor(client.config.bot.color)
        .setTitle(`${getPlatformEmoji(platform)} Đã thêm ${type === 'album' ? 'album' : 'playlist'}`)
        .setDescription(
            `📝 **${playlistName}**` +
                (searchInfo?.isFallback ? `\n🔄 Tìm thấy trên **${searchInfo.searchSourceName}**` : '')
        )
        .addFields([
            { name: '🎵 Số bài', value: `${result.tracks.length} bài`, inline: true },
            {
                name: '📍 Nguồn',
                value: searchInfo?.searchSourceName || platform.charAt(0).toUpperCase() + platform.slice(1),
                inline: true
            }
        ])
        .setFooter({ text: client.config.bot.footer })
        .setTimestamp();

    if (result.playlistInfo?.artworkUrl) playlistEmbed.setThumbnail(result.playlistInfo.artworkUrl);
    await interaction.editReply({ embeds: [playlistEmbed] });

    await ensurePlayback(interaction, queue, client);
}

async function handleSingleTrackResult({ interaction, client, queue, track, platform, searchInfo }) {
    track.requester = interaction.user.id;
    queue.add(track);

    if (client.metrics) client.metrics.trackMusic('track_added', { platform });

    await interaction.editReply({
        embeds: [createTrackAddedEmbed(track, queue.tracks.length, client.config, searchInfo)]
    });

    await ensurePlayback(interaction, queue, client);
}

async function ensurePlayback(interaction, queue, client) {
    if (!queue.current) {
        await queue.play();
        setTimeout(async () => {
            try {
                if (!queue.current) {
                    logger.warn('No current track in queue after play, skipping now-playing message');
                    return;
                }
                const nowPlayingMessage = await interaction.channel.send({
                    embeds: [createNowPlayingEmbed(queue.current, queue, client.config)],
                    components: createNowPlayingButtons(queue, false)
                });
                queue.setNowPlayingMessage(nowPlayingMessage);
            } catch (error) {
                logger.error('Failed to send now playing message', error);
            }
        }, 1000);
    }
}

async function handlePlayError(interaction, client, error) {
    if (error instanceof CircuitBreakerError) {
        const degradedMessage = getDegradedModeMessage('tìm kiếm nhạc');
        degradedMessage.description = 'Hệ thống tìm kiếm nhạc đang quá tải. Vui lòng thử lại sau 1-2 phút.';

        const embed = new EmbedBuilder()
            .setColor(degradedMessage.color)
            .setTitle(degradedMessage.title)
            .setDescription(degradedMessage.description)
            .addFields(degradedMessage.fields)
            .setFooter({ text: client.config.bot.footer })
            .setTimestamp(degradedMessage.timestamp);
        return interaction.editReply({ embeds: [embed] });
    }

    logger.error('Play command error', error);
    await sendErrorResponse(interaction, error, client.config);
}

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Phát nhạc từ YouTube, Spotify, SoundCloud, v.v.')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('URL hoặc từ khóa tìm kiếm (hỗ trợ YouTube, Spotify, SoundCloud)')
                .setRequired(true)
        ),

    async execute(interaction, client) {
        await interaction.deferReply();

        try {
            if (!isMusicSystemAvailable(client.musicManager)) {
                return handleDegradedMode(interaction);
            }

            const query = normalizeSearchQuery(interaction.options.getString('query'));
            const voiceChannel = validateVoicePermissions(interaction);

            // Get or create queue
            const queue = await getOrCreateQueue(client, interaction, voiceChannel);

            const { platform, type, isUrl } = detectPlatform(query);
            logger.debug('Play command', { query: query.substring(0, 50), platform, type });

            await handleSpotifyLoading(interaction, platform, type);

            const result = await client.musicManager.search(query, interaction.user);

            if (result?.error === 'SERVICE_UNAVAILABLE') {
                return handleDegradedMode(interaction);
            }

            if (!result || !result.tracks || result.tracks.length === 0) {
                return handleNoResults(interaction, client, query, platform);
            }

            // Handle Search Confirmation (if not URL)
            if (!isUrl && result.loadType === 'search' && result.tracks.length > 0) {
                const searchTracks = result.tracks.slice(0, 5);
                const topTrack = result.tracks[0];

                // Check ALL search results for auto-play preference (not just top result).
                // This fixes the case where a user saved a preference for a specific version
                // (e.g., OST lyrics) but the search returns the MV version as the top result.
                const autoPlayMatch = checkAutoPlayFromResults(interaction.user.id, searchTracks);

                if (autoPlayMatch && autoPlayMatch.matchIndex >= 0) {
                    // BUG-002: Guard against queue-full — fall back to manual confirmation
                    const maxQueueSize = client.config?.music?.maxQueueSize || 500;
                    if (queue.tracks.length >= maxQueueSize) {
                        return handleSearchConfirmation(interaction, client, topTrack, searchTracks);
                    }

                    // Auto-play: use the MATCHED track (could be any result, not just tracks[0])
                    const matchedTrack = searchTracks[autoPlayMatch.matchIndex] || topTrack;
                    const matchedTrackUrl = matchedTrack.info?.uri || matchedTrack.uri || matchedTrack.url || '';
                    matchedTrack.requester = interaction.user.id;
                    queue.add(matchedTrack);

                    // Build informative auto-play message
                    const matchedTitle = matchedTrack.info?.title || autoPlayMatch.trackTitle || 'Unknown';
                    const isAlternateVersion = autoPlayMatch.matchIndex > 0;
                    const description = isAlternateVersion
                        ? `🔄 Đã tự động phát **${truncateTitle(matchedTitle, 50)}**\n` +
                          '💡 _Đây là phiên bản bạn đã chọn trước đó_'
                        : `🔄 Đã tự động phát **${truncateTitle(matchedTitle, 50)}**`;

                    const autoPlayEmbed = new EmbedBuilder()
                        .setColor(COLORS.SUCCESS)
                        .setDescription(description)
                        .setFooter({ text: client.config.bot.footer })
                        .setTimestamp();

                    await interaction.editReply({ embeds: [autoPlayEmbed] });
                    markAutoPlayed(interaction.user.id, matchedTrackUrl);
                    await ensurePlayback(interaction, queue, client);

                    logger.command('play-auto', interaction.user.id, interaction.guildId, {
                        platform,
                        matchIndex: autoPlayMatch.matchIndex,
                        confidence: autoPlayMatch.confidence
                    });
                    return;
                }

                return handleSearchConfirmation(interaction, client, topTrack, searchTracks);
            }

            // v1.11.0: Build search source info for fallback badge
            const searchInfo = result.searchSource
                ? {
                      searchSource: result.searchSource,
                      searchSourceName: result.searchSourceName || result.searchSource,
                      isFallback:
                          !isUrl && result.searchSource !== SEARCH_PREFIXES.YOUTUBE && result.searchSource !== 'url'
                  }
                : null;

            // Handle Results
            if (result.loadType === 'playlist') {
                // BUG-C01: Validate tracks have encoded field before adding to queue
                result.tracks = result.tracks.filter(t => t.encoded);
                if (result.tracks.length === 0) {
                    return handleNoResults(interaction, client, query, platform);
                }
                await handlePlaylistResult({ interaction, client, queue, result, platform, type, searchInfo });
            } else {
                const track = result.tracks[0];
                // BUG-C01: Validate track.encoded exists before passing to queue
                if (!track.encoded) {
                    logger.warn('Track missing encoded field', { query: query.substring(0, 50), platform });
                    return handleNoResults(interaction, client, query, platform);
                }
                await handleSingleTrackResult({ interaction, client, queue, track, platform, searchInfo });
            }

            logger.command('play', interaction.user.id, interaction.guildId, { platform, type });
        } catch (error) {
            await handlePlayError(interaction, client, error);
        }
    }
};
