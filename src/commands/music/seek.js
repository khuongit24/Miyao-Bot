import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse, createErrorEmbed } from '../../UI/embeds/ErrorEmbeds.js';
import { requireCurrentTrack } from '../../middleware/queueCheck.js';
import {
    UserNotInVoiceError,
    DifferentVoiceChannelError,
    InvalidTimeError,
    InvalidPositionError
} from '../../utils/errors.js';
import { isMusicSystemAvailable, getDegradedModeMessage } from '../../utils/resilience.js';
import { parseTime, formatDuration } from '../../utils/helpers.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Tua đến thời điểm cụ thể')
        .addStringOption(option =>
            option.setName('time').setDescription('Ví dụ: 1:30, 02:45, 1:23:45').setRequired(true)
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

            // Use middleware — requireCurrentTrack ensures queue.current is not null
            const { queue } = requireCurrentTrack(client.musicManager, interaction.guildId);

            // Check if user is in the same voice channel
            const member = interaction.member;
            if (!member.voice.channel) {
                throw new UserNotInVoiceError();
            }
            if (member.voice.channel.id !== queue.voiceChannelId) {
                throw new DifferentVoiceChannelError();
            }

            // Check if track is seekable
            if (queue.current?.info?.isStream) {
                return interaction.editReply({
                    embeds: [createErrorEmbed('Không thể tua livestream!', client.config)]
                });
            }

            const timeString = interaction.options.getString('time');

            // Validate time format: SS, MM:SS, or HH:MM:SS
            const isValidFormat = /^(?:(?:(\d{1,2}):)?([0-5]?\d):)?([0-5]?\d)$/.test(timeString.trim());

            if (!isValidFormat) {
                throw new InvalidTimeError(timeString);
            }

            const position = parseTime(timeString);
            const trackLength = queue.current?.info?.length || 0;

            // BUG-C19: Validate track has a known duration before seeking
            if (trackLength <= 0) {
                return interaction.editReply({
                    embeds: [
                        createErrorEmbed('Không thể tua bài hát này (không xác định được thời lượng)!', client.config)
                    ]
                });
            }

            // BUG-C19: Use >= to prevent seeking to exactly the end of track
            if (position < 0 || position >= trackLength) {
                // Since InvalidPositionError expects index/max for queue usually,
                // but here we are validating time in track.
                // We can construct a custom Validation Error or use InvalidPositionError with custom message if allowed?
                // InvalidPositionError constructor takes (position, max).
                // It says "Position X is out of range".
                // Here we dealing with Time.
                // Maybe stick to createErrorEmbed for custom message about duration.

                const formattedDuration = formatDuration(trackLength);
                return interaction.editReply({
                    embeds: [
                        createErrorEmbed(
                            `Thời điểm không hợp lệ! Bài hát chỉ dài **${formattedDuration}**.`,
                            client.config
                        )
                    ]
                });
            }

            // Seek
            await queue.seek(position);

            await interaction.editReply({
                embeds: [createSuccessEmbed('Tua nhạc', `Đã tua đến **${timeString}**`, client.config)]
            });

            logger.command('seek', interaction.user.id, interaction.guildId);
        } catch (error) {
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
