import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { requireVoiceChannel } from '../../middleware/voiceCheck.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
import { formatDuration } from '../../utils/helpers.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Tìm kiếm bài hát')
        .addStringOption(option => option.setName('query').setDescription('Tên bài hát hoặc URL').setRequired(true))
        .addStringOption(option =>
            option
                .setName('source')
                .setDescription('Nguồn tìm kiếm')
                .setRequired(false)
                .addChoices(
                    { name: 'YouTube', value: 'ytsearch' },
                    { name: 'YouTube Music', value: 'ytmsearch' },
                    { name: 'SoundCloud', value: 'scsearch' },
                    { name: 'Spotify', value: 'spsearch' },
                    { name: 'Deezer', value: 'dzsearch' }
                )
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

            // Validate voice channel
            requireVoiceChannel(interaction);

            const query = interaction.options.getString('query');
            const source = interaction.options.getString('source') || 'ytsearch';

            // SRCH-C01 fix: Pass source via options instead of prefixing query
            // to avoid double-prefix in MusicManager._executeSearch()
            const result = await client.musicManager.search(query, interaction.user.id, { requestedSource: source });

            if (!result || !result.tracks || result.tracks.length === 0) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(client.config.bot.color)
                            .setTitle('🔍 Không tìm thấy')
                            .setDescription(`Không tìm thấy kết quả cho: **${query}**`)
                            .setFooter({ text: client.config.bot.footer })
                            .setTimestamp()
                    ]
                });
            }

            const tracks = result.tracks.slice(0, 10);

            // CMD-H04 fix: Null-safe track rendering for all paths
            const description = tracks
                .map((track, index) => {
                    const title = track?.info?.title || 'Unknown Track';
                    const author = track?.info?.author || 'Unknown Artist';
                    const duration = track?.info?.isStream
                        ? '🔴 LIVE'
                        : track?.info?.length
                          ? formatDuration(track.info.length)
                          : '?:??';
                    const uri = track?.info?.uri || '#';

                    const displayTitle = title.length > 60 ? title.substring(0, 57) + '...' : title;
                    const displayAuthor = author.length > 30 ? author.substring(0, 27) + '...' : author;

                    return `**${index + 1}.** [${displayTitle}](${uri})\n└ 🎤 ${displayAuthor} • ⏱️ ${duration}`;
                })
                .join('\n\n');

            const embed = new EmbedBuilder()
                .setColor(client.config.bot.color)
                .setTitle(`🔍 Kết quả tìm kiếm: ${query}`)
                .setDescription(description)
                .setFooter({ text: `${client.config.bot.footer} • Chọn bài hát bên dưới để phát` })
                .setTimestamp();

            // Build select menu with null-safe track data
            const options = tracks.map((track, index) => {
                const title = track?.info?.title || 'Unknown Track';
                const author = track?.info?.author || 'Unknown Artist';
                const duration = track?.info?.isStream
                    ? 'LIVE'
                    : track?.info?.length
                      ? formatDuration(track.info.length)
                      : '?:??';

                return {
                    label: title.substring(0, 100),
                    description: `${author.substring(0, 50)} • ${duration}`,
                    value: `${index}`,
                    emoji: '🎵'
                };
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`search_select_${interaction.user.id}`)
                .setPlaceholder('🎵 Chọn bài hát để phát')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            // Store search results for selection handler
            // Key must match what SearchHandlers.handleSearchSelect reads
            const cacheKey = `${interaction.user.id}:${interaction.guildId}`;
            if (client.cacheManager) {
                client.cacheManager.set('searchResults', cacheKey, {
                    tracks,
                    timestamp: Date.now()
                });
            } else {
                client._lastSearchResults = client._lastSearchResults || new Map();
                if (client._lastSearchResults.size >= 50) {
                    const oldestKey = client._lastSearchResults.keys().next().value;
                    client._lastSearchResults.delete(oldestKey);
                }
                client._lastSearchResults.set(cacheKey, {
                    tracks,
                    timestamp: Date.now()
                });
                setTimeout(() => client._lastSearchResults?.delete(cacheKey), 5 * 60 * 1000);
            }

            await interaction.editReply({ embeds: [embed], components: [row] });

            logger.command('search', interaction.user.id, interaction.guildId, { query, source });
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
