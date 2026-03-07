import { SlashCommandBuilder } from 'discord.js';
import { createNowPlayingEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { createNowPlayingButtons } from '../../UI/components/MusicControls.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { requireCurrentTrack } from '../../middleware/queueCheck.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder().setName('nowplaying').setDescription('Hiển thị bài hát đang phát kèm điều khiển'),

    async execute(interaction, client) {
        await interaction.deferReply();
        try {
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

            const currentPosition = queue.player?.position || 0;

            const reply = await interaction.editReply({
                embeds: [createNowPlayingEmbed(current, queue, client.config, currentPosition)],
                components: createNowPlayingButtons(queue, false)
            });

            // Update stored message for auto-updates
            queue.setNowPlayingMessage(reply);

            logger.command('nowplaying', interaction.user.id, interaction.guildId);
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
