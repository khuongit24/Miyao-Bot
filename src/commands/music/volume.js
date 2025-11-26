import { SlashCommandBuilder } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { sendErrorResponse } from '../../UI/embeds/ErrorEmbeds.js';
import { NothingPlayingError, DifferentVoiceChannelError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Điều chỉnh âm lượng')
        .addIntegerOption(option =>
            option.setName('level')
                .setDescription('Mức âm lượng (0-100)')
                .setMinValue(0)
                .setMaxValue(100)
                .setRequired(true)
        ),
    
    async execute(interaction, client) {
        try {
            const queue = client.musicManager.getQueue(interaction.guildId);
            
            // Check if there's a queue
            if (!queue) {
                throw new NothingPlayingError();
            }
            
            // Check if user is in the same voice channel
            const member = interaction.member;
            if (!member.voice.channel || member.voice.channel.id !== queue.voiceChannelId) {
                throw new DifferentVoiceChannelError();
            }
            
            const volume = interaction.options.getInteger('level');
            
            // Set volume
            await queue.setVolume(volume);
            
            await interaction.reply({
                embeds: [createSuccessEmbed('Âm lượng', `Đã đặt âm lượng thành **${volume}%**`, client.config)]
            });
            
            logger.command('volume', interaction.user.id, interaction.guildId);
            
        } catch (error) {
            logger.error('Volume command error', error);
            await sendErrorResponse(interaction, error, client.config, true);
        }
    }
};
