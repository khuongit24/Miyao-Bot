/**
 * @file voiceCheck.js
 * @description Middleware for voice channel related checks
 * @version 1.8.0 - New middleware system
 * 
 * This middleware provides reusable voice channel validation functions
 * that can be applied to commands that require the user to be in a voice channel.
 */

import { 
    UserNotInVoiceError, 
    DifferentVoiceChannelError,
    VoiceChannelPermissionError,
    NothingPlayingError
} from '../utils/errors.js';

/**
 * Check if user is in a voice channel
 * @param {CommandInteraction} interaction - Discord interaction
 * @throws {UserNotInVoiceError} If user is not in a voice channel
 * @returns {{ voiceChannel: VoiceChannel, member: GuildMember }}
 */
export function requireVoiceChannel(interaction) {
    const member = interaction.member;
    const voiceChannel = member.voice.channel;
    
    if (!voiceChannel) {
        throw new UserNotInVoiceError();
    }
    
    return { voiceChannel, member };
}

/**
 * Check if bot has permissions in the voice channel
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {VoiceChannel} voiceChannel - Voice channel to check
 * @throws {VoiceChannelPermissionError} If bot lacks permissions
 */
export function checkVoicePermissions(interaction, voiceChannel) {
    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    
    if (!permissions.has(['Connect', 'Speak'])) {
        throw new VoiceChannelPermissionError(voiceChannel.name);
    }
}

/**
 * Check if user is in the same voice channel as the bot
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {EnhancedQueue} queue - Music queue
 * @throws {DifferentVoiceChannelError} If user is in a different channel
 * @returns {boolean}
 */
export function requireSameVoiceChannel(interaction, queue) {
    if (!queue || !queue.voiceChannelId) {
        return true; // No queue means no restriction
    }
    
    const member = interaction.member;
    
    if (!member.voice.channel) {
        throw new UserNotInVoiceError();
    }
    
    if (member.voice.channel.id !== queue.voiceChannelId) {
        throw new DifferentVoiceChannelError();
    }
    
    return true;
}

/**
 * Combined middleware: Check voice channel AND same channel as bot
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {MusicManager} musicManager - Music manager instance
 * @returns {{ voiceChannel: VoiceChannel, member: GuildMember, queue: EnhancedQueue|null }}
 */
export function requireVoiceWithQueue(interaction, musicManager) {
    const { voiceChannel, member } = requireVoiceChannel(interaction);
    const queue = musicManager.getQueue(interaction.guildId);
    
    if (queue) {
        requireSameVoiceChannel(interaction, queue);
    }
    
    return { voiceChannel, member, queue };
}

/**
 * Full voice check middleware: voice + permissions + same channel
 * Ideal for commands that need to interact with playback
 * @param {CommandInteraction} interaction - Discord interaction
 * @param {MusicManager} musicManager - Music manager instance
 * @returns {{ voiceChannel: VoiceChannel, member: GuildMember, queue: EnhancedQueue|null }}
 */
export function fullVoiceCheck(interaction, musicManager) {
    const { voiceChannel, member } = requireVoiceChannel(interaction);
    
    checkVoicePermissions(interaction, voiceChannel);
    
    const queue = musicManager.getQueue(interaction.guildId);
    
    if (queue) {
        requireSameVoiceChannel(interaction, queue);
    }
    
    return { voiceChannel, member, queue };
}

export default {
    requireVoiceChannel,
    checkVoicePermissions,
    requireSameVoiceChannel,
    requireVoiceWithQueue,
    fullVoiceCheck
};
