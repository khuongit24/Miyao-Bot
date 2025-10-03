import { createErrorEmbed, createSuccessEmbed, createQueueEmbed, createInfoEmbed, createTrackAddedEmbed, createNowPlayingEmbed, createHistoryReplayEmbed } from '../../UI/embeds/MusicEmbeds.js';
import { createQueueButtons, createNowPlayingButtons, createHistoryReplayButtons } from '../../UI/components/MusicControls.js';
import logger from '../utils/logger.js';

/**
 * Handle button interactions for music controls
 */
export async function handleMusicButton(interaction, client) {
    const customId = interaction.customId;
    
    // Get queue
    let queue = client.musicManager.getQueue(interaction.guildId);
    
    // Check if user is in voice channel
    const member = interaction.member;
    const voiceChannel = member.voice.channel;
    
    if (!voiceChannel) {
        return interaction.reply({
            embeds: [createErrorEmbed('Bạn phải ở trong voice channel để sử dụng nút này!', client.config)],
            ephemeral: true
        });
    }
    
    // Check if bot is in same voice channel
    if (queue && queue.voiceChannelId !== voiceChannel.id) {
        return interaction.reply({
            embeds: [createErrorEmbed('Bạn phải ở cùng voice channel với bot!', client.config)],
            ephemeral: true
        });
    }
    
    // Handle search selection buttons first
    try {
        if (customId === 'search_cancel') {
            await interaction.update({ content: '❌ Đã hủy lựa chọn.', embeds: [], components: [] });
            return;
        }
        if (customId.startsWith('search_pick_')) {
            const idx = parseInt(customId.split('search_pick_')[1]);
            const key = `${interaction.user.id}:${interaction.guildId}`;
            const userCache = client._lastSearchResults?.get(key);
            if (!userCache || !Array.isArray(userCache.tracks)) {
                return interaction.update({
                    embeds: [createErrorEmbed('Phiên tìm kiếm đã hết hạn, hãy dùng lại /play.', client.config)],
                    components: []
                });
            }
            const track = userCache.tracks[idx];
            if (!track) {
                return interaction.update({
                    embeds: [createErrorEmbed('Mục bạn chọn không hợp lệ.', client.config)],
                    components: []
                });
            }
            // Ensure queue exists and same voice
            if (!queue) {
                queue = await client.musicManager.createQueue(interaction.guildId, voiceChannel.id, interaction.channel);
            }
            if (queue.voiceChannelId !== voiceChannel.id) {
                return interaction.update({
                    embeds: [createErrorEmbed('Bot đang ở voice channel khác!', client.config)],
                    components: []
                });
            }
            queue.add(track);
            const position = queue.current ? queue.tracks.length : 1;
            
            // Clean up cache immediately after use
            client._lastSearchResults.delete(key);
            
            await interaction.update({
                embeds: [createTrackAddedEmbed(track, position, client.config)],
                components: []
            });
            if (!queue.current) {
                await queue.play();
                try {
                    const nowPlayingMessage = await interaction.channel.send({
                        embeds: [createNowPlayingEmbed(queue.current, queue, client.config)],
                        components: createNowPlayingButtons(queue, false)
                    });
                    queue.setNowPlayingMessage(nowPlayingMessage);
                } catch (err) {
                    logger.error('Failed to send now playing message after search pick', err);
                }
            }
            return;
        }

        // Handle different button types
        switch (customId) {
            case 'music_pause':
                await handlePause(interaction, queue, client);
                break;
            
            case 'music_resume':
                await handleResume(interaction, queue, client);
                break;
            
            case 'music_stop':
                await handleStop(interaction, queue, client);
                break;
            
            case 'music_skip':
                await handleSkip(interaction, queue, client);
                break;
            
            case 'music_loop':
                await handleLoop(interaction, queue, client);
                break;
            
            case 'music_shuffle':
                await handleShuffle(interaction, queue, client);
                break;
            
            case 'music_volume_up':
                await handleVolumeUp(interaction, queue, client);
                break;
            
            case 'music_volume_down':
                await handleVolumeDown(interaction, queue, client);
                break;
            
            case 'music_queue':
                await handleShowQueue(interaction, queue, client);
                break;
            
            // Seek buttons
            case 'music_seek_backward_30':
                await handleSeek(interaction, queue, client, -30000);
                break;
            
            case 'music_seek_backward_10':
                await handleSeek(interaction, queue, client, -10000);
                break;
            
            case 'music_seek_start':
                await handleSeek(interaction, queue, client, 0, true);
                break;
            
            case 'music_seek_forward_10':
                await handleSeek(interaction, queue, client, 10000);
                break;
            
            case 'music_seek_forward_30':
                await handleSeek(interaction, queue, client, 30000);
                break;
            
            case 'music_replay':
                await handleReplay(interaction, queue, client);
                break;
            
            case 'history_replay_cancel':
                await interaction.update({ 
                    content: '❌ Đã hủy chọn bài từ lịch sử.', 
                    embeds: [], 
                    components: [] 
                });
                break;
            
            default:
                await interaction.reply({
                    embeds: [createErrorEmbed('Nút này chưa được triển khai!', client.config)],
                    ephemeral: true
                });
        }
    } catch (error) {
        logger.error(`Button handler error: ${customId}`, error);
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                embeds: [createErrorEmbed('Đã xảy ra lỗi khi xử lý nút này!', client.config)],
                ephemeral: true
            });
        }
    }
}

/**
 * Handle showing queue when queue button is clicked from now playing
 */
async function handleShowQueue(interaction, queue, client) {
    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
            ephemeral: true
        });
    }
    
    const page = 1;
    const totalPages = Math.ceil((queue.tracks.length + 1) / 10);
    
    await interaction.reply({
        embeds: [createQueueEmbed(queue, client.config, page)],
        components: totalPages > 1 ? createQueueButtons(page, totalPages) : [],
        ephemeral: false
    });
}

/**
 * Handle queue pagination buttons
 */
export async function handleQueueButton(interaction, queue, client) {
    const customId = interaction.customId;
    
    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
            ephemeral: true
        });
    }
    
    // Get current page from button label
    const currentButton = interaction.message.components[0]?.components[2];
    
    if (!currentButton || !currentButton.data?.label) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không thể xác định trang hiện tại!', client.config)],
            ephemeral: true
        });
    }
    
    const labelMatch = currentButton.data.label.match(/(\d+)\/(\d+)/);
    
    if (!labelMatch) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không thể xác định trang hiện tại!', client.config)],
            ephemeral: true
        });
    }
    
    let page = parseInt(labelMatch[1]);
    const totalPages = parseInt(labelMatch[2]);
    
    // Calculate new page
    switch (customId) {
        case 'queue_first':
            page = 1;
            break;
        case 'queue_previous':
            page = Math.max(1, page - 1);
            break;
        case 'queue_refresh':
            // Recalculate total pages in case queue changed
            const newTotalPages = Math.ceil((queue.tracks.length + 1) / 10);
            page = Math.min(page, newTotalPages);
            break;
        case 'queue_next':
            page = Math.min(totalPages, page + 1);
            break;
        case 'queue_last':
            page = totalPages;
            break;
    }
    
    // Recalculate total pages for updated queue
    const updatedTotalPages = Math.ceil((queue.tracks.length + 1) / 10);
    
    // Update message
    await interaction.update({
        embeds: [createQueueEmbed(queue, client.config, page)],
        components: updatedTotalPages > 1 ? createQueueButtons(page, updatedTotalPages) : []
    });
}

// Individual button handlers
async function handlePause(interaction, queue, client) {
    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
            ephemeral: true
        });
    }
    
    if (queue.paused) {
        return interaction.reply({
            embeds: [createErrorEmbed('Nhạc đã được tạm dừng rồi!', client.config)],
            ephemeral: true
        });
    }
    
    await queue.pause();
    
    await interaction.reply({
        embeds: [createSuccessEmbed('Đã tạm dừng', 'Nhạc đã được tạm dừng.', client.config)],
        ephemeral: true
    });
    
    logger.music('Track paused via button', { guildId: interaction.guildId });
}

async function handleResume(interaction, queue, client) {
    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
            ephemeral: true
        });
    }
    
    if (!queue.paused) {
        return interaction.reply({
            embeds: [createErrorEmbed('Nhạc đang phát!', client.config)],
            ephemeral: true
        });
    }
    
    await queue.resume();
    
    await interaction.reply({
        embeds: [createSuccessEmbed('Đã tiếp tục', 'Nhạc đã được tiếp tục.', client.config)],
        ephemeral: true
    });
    
    logger.music('Track resumed via button', { guildId: interaction.guildId });
}

async function handleStop(interaction, queue, client) {
    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
            ephemeral: true
        });
    }
    
    await queue.stop();
    
    await interaction.reply({
        embeds: [createSuccessEmbed('Đã dừng', 'Đã dừng phát nhạc và xóa hàng đợi.', client.config)],
        ephemeral: true
    });
    
    logger.music('Queue stopped via button', { guildId: interaction.guildId });
}

async function handleSkip(interaction, queue, client) {
    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
            ephemeral: true
        });
    }
    
    const skipped = queue.current.info.title;
    await queue.skip();
    
    await interaction.reply({
        embeds: [createSuccessEmbed('Đã bỏ qua', `Đã bỏ qua **${skipped}**`, client.config)],
        ephemeral: true
    });
    
    logger.music('Track skipped via button', { guildId: interaction.guildId });
}

async function handleLoop(interaction, queue, client) {
    if (!queue) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có hàng đợi nào!', client.config)],
            ephemeral: true
        });
    }
    
    // Cycle through loop modes: off -> track -> queue -> off
    const modes = ['off', 'track', 'queue'];
    const currentIndex = modes.indexOf(queue.loop);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    
    await queue.setLoop(nextMode);
    
    const modeText = {
        'off': 'Tắt',
        'track': '🔂 Lặp bài hát',
        'queue': '🔁 Lặp hàng đợi'
    };
    
    await interaction.reply({
        embeds: [createSuccessEmbed('Đã thay đổi chế độ lặp', `Chế độ lặp: **${modeText[nextMode]}**`, client.config)],
        ephemeral: true
    });
    
    logger.music('Loop mode changed via button', { guildId: interaction.guildId, mode: nextMode });
}

async function handleShuffle(interaction, queue, client) {
    if (!queue) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có hàng đợi nào!', client.config)],
            ephemeral: true
        });
    }
    
    if (queue.tracks.length < 2) {
        return interaction.reply({
            embeds: [createErrorEmbed('Cần ít nhất 2 bài trong hàng đợi để xáo trộn!', client.config)],
            ephemeral: true
        });
    }
    
    queue.shuffle();
    
    await interaction.reply({
        embeds: [createSuccessEmbed('Đã xáo trộn', `Đã xáo trộn ${queue.tracks.length} bài trong hàng đợi.`, client.config)],
        ephemeral: true
    });
    
    logger.music('Queue shuffled via button', { guildId: interaction.guildId });
}

async function handleVolumeUp(interaction, queue, client) {
    if (!queue) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có hàng đợi nào!', client.config)],
            ephemeral: true
        });
    }
    
    const newVolume = Math.min(100, queue.volume + 10);
    await queue.setVolume(newVolume);
    
    await interaction.reply({
        embeds: [createInfoEmbed('Âm lượng', `Đã tăng âm lượng lên **${newVolume}%**`, client.config)],
        ephemeral: true
    });
    
    // Update now playing immediately
    await queue.updateNowPlaying();
    
    logger.music('Volume increased via button', { guildId: interaction.guildId, volume: newVolume });
}

async function handleVolumeDown(interaction, queue, client) {
    if (!queue) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có hàng đợi nào!', client.config)],
            ephemeral: true
        });
    }
    
    const newVolume = Math.max(0, queue.volume - 10);
    await queue.setVolume(newVolume);
    
    await interaction.reply({
        embeds: [createInfoEmbed('Âm lượng', `Đã giảm âm lượng xuống **${newVolume}%**`, client.config)],
        ephemeral: true
    });
    
    // Update now playing immediately
    await queue.updateNowPlaying();
    
    logger.music('Volume decreased via button', { guildId: interaction.guildId, volume: newVolume });
}

/**
 * Handle seek button (interactive progress bar seeking)
 * @param {number} offset - Milliseconds to seek (negative for backward, positive for forward)
 * @param {boolean} absolute - If true, seek to absolute position (offset is position, not delta)
 */
async function handleSeek(interaction, queue, client, offset, absolute = false) {
    if (!queue || !queue.current) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có nhạc nào đang phát!', client.config)],
            ephemeral: true
        });
    }
    
    // Validate offset parameter
    if (typeof offset !== 'number' || isNaN(offset)) {
        return interaction.reply({
            embeds: [createErrorEmbed('Tham số seek không hợp lệ!', client.config)],
            ephemeral: true
        });
    }
    
    // Check if track is seekable
    if (queue.current.info?.isStream) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không thể tua livestream!', client.config)],
            ephemeral: true
        });
    }
    
    const currentPosition = queue.player?.position || 0;
    const duration = queue.current.info?.length;
    
    // Validate duration
    if (!duration || duration <= 0) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không thể xác định thời lượng bài hát!', client.config)],
            ephemeral: true
        });
    }
    
    let newPosition;
    
    if (absolute) {
        // Absolute seek (e.g., restart button)
        newPosition = offset;
    } else {
        // Relative seek (e.g., +10s, -30s)
        newPosition = currentPosition + offset;
    }
    
    // Clamp to valid range
    newPosition = Math.max(0, Math.min(newPosition, duration - 1000));
    
    // Seek
    await queue.seek(newPosition);
    
    // Format time for display
    const formatTime = (ms) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    };
    
    const action = absolute ? '🔄 Restart' : 
                   offset > 0 ? `⏩ +${Math.abs(offset / 1000)}s` : 
                   `⏪ -${Math.abs(offset / 1000)}s`;
    
    await interaction.reply({
        embeds: [createInfoEmbed(
            'Đã tua nhạc',
            `${action}\n**Vị trí mới:** ${formatTime(newPosition)} / ${formatTime(duration)}`,
            client.config
        )],
        ephemeral: true
    });
    
    // Update now playing immediately with new position
    await queue.updateNowPlaying();
    
    logger.music('Track seeked via button', { 
        guildId: interaction.guildId, 
        offset, 
        absolute, 
        newPosition,
        track: queue.current.info.title
    });
}

/**
 * Handle replay button - Show history with dropdown
 */
async function handleReplay(interaction, queue, client) {
    if (!queue) {
        return interaction.reply({
            embeds: [createErrorEmbed('Không có lịch sử phát nhạc!', client.config)],
            ephemeral: true
        });
    }
    
    const history = queue.history || [];
    
    if (history.length === 0) {
        return interaction.reply({
            embeds: [createErrorEmbed('Chưa có bài hát nào trong lịch sử!', client.config)],
            ephemeral: true
        });
    }
    
    // Initialize cache if needed
    if (!client._historyCache) {
        client._historyCache = new Map();
        
        // Setup periodic cleanup every minute to prevent memory leaks
        setInterval(() => {
            const now = Date.now();
            let cleanedCount = 0;
            for (const [key, value] of client._historyCache.entries()) {
                if (!value?.timestamp || now - value.timestamp > 300000) {
                    client._historyCache.delete(key);
                    cleanedCount++;
                }
            }
            if (cleanedCount > 0) {
                logger.debug(`Cleaned ${cleanedCount} expired history cache entries`);
            }
        }, 60000);
    }
    
    // Store history in client cache for later retrieval
    const key = `${interaction.user.id}:${interaction.guildId}`;
    
    // Clean up old entry if exists
    if (client._historyCache.has(key)) {
        client._historyCache.delete(key);
    }
    
    client._historyCache.set(key, { history, timestamp: Date.now() });
    
    await interaction.reply({
        embeds: [createHistoryReplayEmbed(history, client.config)],
        components: createHistoryReplayButtons(history),
        ephemeral: false
    });
    
    logger.music('History replay menu shown', { 
        guildId: interaction.guildId,
        historyCount: history.length,
        userId: interaction.user.id
    });
}

/**
 * Handle history replay select dropdown
 */
export async function handleHistoryReplaySelect(interaction, client) {
    try {
        // Validate and get selected index
        const selectedValue = interaction.values?.[0];
        if (!selectedValue) {
            return interaction.update({
                embeds: [createErrorEmbed('Không thể xác định lựa chọn của bạn.', client.config)],
                components: []
            });
        }
        
        const idx = parseInt(selectedValue, 10);
        if (isNaN(idx) || idx < 0) {
            return interaction.update({
                embeds: [createErrorEmbed('Lựa chọn không hợp lệ.', client.config)],
                components: []
            });
        }
        
        // Get user cache with proper validation
        const key = `${interaction.user.id}:${interaction.guildId}`;
        const userCache = client._historyCache?.get(key);
        
        if (!userCache || !Array.isArray(userCache.history)) {
            return interaction.update({
                embeds: [createErrorEmbed('Phiên lịch sử đã hết hạn, hãy bấm nút Replay lại.', client.config)],
                components: []
            });
        }
        
        // Check if index is within bounds
        if (idx >= userCache.history.length) {
            return interaction.update({
                embeds: [createErrorEmbed('Bài hát không hợp lệ.', client.config)],
                components: []
            });
        }
        
        const entry = userCache.history[idx];
        if (!entry?.track?.info) {
            return interaction.update({
                embeds: [createErrorEmbed('Dữ liệu bài hát không hợp lệ.', client.config)],
                components: []
            });
        }
        
        const track = entry.track;
        
        // Check voice channel
        const member = interaction.member;
        const voiceChannel = member.voice.channel;
        
        if (!voiceChannel) {
            return interaction.update({
                embeds: [createErrorEmbed('Bạn phải ở trong voice channel!', client.config)],
                components: []
            });
        }
        
        // Get or create queue
        let queue = client.musicManager.getQueue(interaction.guildId);
        
        if (!queue) {
            queue = await client.musicManager.createQueue(interaction.guildId, voiceChannel.id, interaction.channel);
        }
        
        if (queue.voiceChannelId !== voiceChannel.id) {
            return interaction.update({
                embeds: [createErrorEmbed('Bot đang ở voice channel khác!', client.config)],
                components: []
            });
        }
        
        // Add track to queue with new requester
        const replayTrack = {
            ...track,
            requester: interaction.user
        };
        
        queue.add(replayTrack);
        const position = queue.current ? queue.tracks.length : 1;
        
        // Clean up cache immediately
        client._historyCache.delete(key);
        
        // Update message
        await interaction.update({
            embeds: [createTrackAddedEmbed(replayTrack, position, client.config)],
            components: []
        });
        
        // Start playing if not already
        if (!queue.current) {
            await queue.play();
            
            try {
                const nowPlayingMessage = await interaction.channel.send({
                    embeds: [createNowPlayingEmbed(queue.current, queue, client.config)],
                    components: createNowPlayingButtons(queue, false)
                });
                queue.setNowPlayingMessage(nowPlayingMessage);
            } catch (err) {
                logger.error('Failed to send now playing message after history replay', err);
            }
        }
        
        logger.info(`Track replayed from history: ${track.info?.title}`);
        
    } catch (error) {
        logger.error('History replay select handler error', error);
        await interaction.update({
            embeds: [createErrorEmbed('Đã xảy ra lỗi khi phát lại bài hát!', client.config)],
            components: []
        }).catch(() => {});
    }
}

/**
 * Handle search select dropdown
 */
export async function handleSearchSelect(interaction, client) {
    try {
        // Get selected index
        const idx = parseInt(interaction.values[0]);
        
        // Get user cache
        const key = `${interaction.user.id}:${interaction.guildId}`;
        const userCache = client._lastSearchResults?.get(key);
        
        if (!userCache || !Array.isArray(userCache.tracks)) {
            return interaction.update({
                embeds: [createErrorEmbed('Phiên tìm kiếm đã hết hạn, hãy dùng lại /play.', client.config)],
                components: []
            });
        }
        
        const track = userCache.tracks[idx];
        if (!track) {
            return interaction.update({
                embeds: [createErrorEmbed('Bài hát không hợp lệ.', client.config)],
                components: []
            });
        }
        
        // Check voice channel
        const member = interaction.member;
        const voiceChannel = member.voice.channel;
        
        if (!voiceChannel) {
            return interaction.update({
                embeds: [createErrorEmbed('Bạn phải ở trong voice channel!', client.config)],
                components: []
            });
        }
        
        // Get or create queue
        let queue = client.musicManager.getQueue(interaction.guildId);
        
        if (!queue) {
            queue = await client.musicManager.createQueue(interaction.guildId, voiceChannel.id, interaction.channel);
        }
        
        if (queue.voiceChannelId !== voiceChannel.id) {
            return interaction.update({
                embeds: [createErrorEmbed('Bot đang ở voice channel khác!', client.config)],
                components: []
            });
        }
        
        // Add track to queue
        queue.add(track);
        const position = queue.current ? queue.tracks.length : 1;
        
        // Clean up cache immediately
        client._lastSearchResults.delete(key);
        
        // Update message
        await interaction.update({
            embeds: [createTrackAddedEmbed(track, position, client.config)],
            components: []
        });
        
        // Start playing if not already
        if (!queue.current) {
            await queue.play();
            
            try {
                const nowPlayingMessage = await interaction.channel.send({
                    embeds: [createNowPlayingEmbed(queue.current, queue, client.config)],
                    components: createNowPlayingButtons(queue, false)
                });
                queue.setNowPlayingMessage(nowPlayingMessage);
            } catch (err) {
                logger.error('Failed to send now playing message after search select', err);
            }
        }
        
        logger.info(`Track selected from search: ${track.info?.title}`);
        
    } catch (error) {
        logger.error('Search select handler error', error);
        await interaction.update({
            embeds: [createErrorEmbed('Đã xảy ra lỗi khi chọn bài hát!', client.config)],
            components: []
        }).catch(() => {});
    }
}

export default {
    handleMusicButton,
    handleQueueButton,
    handleSearchSelect,
    handleHistoryReplaySelect
};
