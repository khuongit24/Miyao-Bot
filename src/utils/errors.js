/**
 * Error Handling System
 * Comprehensive error taxonomy with user-friendly messages
 * @module errors
 * @version 1.11.2 - Enhanced UX with emojis and better suggestions
 */

import { COLORS } from '../config/design-system.js';

/**
 * Error type emojis for visual identification
 */
const ERROR_TYPE_EMOJIS = {
    network: '🌐',
    permission: '🔒',
    validation: '📝',
    rateLimit: '⏱️',
    notFound: '🔍',
    queue: '📋',
    player: '🎵',
    database: '💾',
    internal: '⚙️',
    voice: '🎤',
    playlist: '📁',
    track: '🎶'
};

/**
 * Base Error Class
 */
export class MiyaoError extends Error {
    constructor(message, code, severity = 'error', suggestions = [], emoji = '❌') {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.severity = severity; // 'info', 'warning', 'error', 'critical'
        this.suggestions = suggestions;
        this.emoji = emoji;
        this.timestamp = new Date().toISOString();
        Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            severity: this.severity,
            suggestions: this.suggestions,
            emoji: this.emoji,
            timestamp: this.timestamp
        };
    }

    /**
     * Get formatted display message with emoji
     */
    getDisplayMessage() {
        return `${this.emoji} ${this.message}`;
    }
}

/**
 * Network related errors
 */
export class NetworkError extends MiyaoError {
    constructor(message, details = {}) {
        super(
            message,
            'NETWORK_ERROR',
            'error',
            ['🔄 Thử lại sau vài giây', '📶 Kiểm tra kết nối internet', '📞 Liên hệ admin nếu lỗi tiếp diễn'],
            ERROR_TYPE_EMOJIS.network
        );
        this.details = details;
    }
}

export class LavalinkConnectionError extends NetworkError {
    constructor(nodeUrl = 'unknown') {
        super('Không thể kết nối đến máy chủ nhạc', { nodeUrl });
        this.code = 'LAVALINK_CONNECTION_ERROR';
        this.emoji = '🔌';
        this.suggestions = [
            '⏳ Đợi vài giây và thử lại',
            '🔄 Bot đang tự động kết nối lại',
            '📞 Liên hệ admin nếu lỗi tiếp diễn quá 1 phút'
        ];
    }
}

export class LavalinkNodeUnavailableError extends NetworkError {
    constructor(availableNodes = 0) {
        super('Hệ thống phát nhạc tạm thời không khả dụng', { availableNodes });
        this.code = 'LAVALINK_NODES_UNAVAILABLE';
        this.severity = 'critical';
        this.emoji = '🚫';
        this.suggestions = [
            '⏳ Hệ thống đang được khởi động lại',
            '🔄 Vui lòng thử lại sau 1-2 phút',
            '📞 Liên hệ admin nếu vấn đề kéo dài'
        ];
    }
}

/**
 * Permission related errors
 */
export class PermissionError extends MiyaoError {
    constructor(message, requiredPermission = null) {
        super(
            message,
            'PERMISSION_ERROR',
            'warning',
            [
                '👤 Kiểm tra quyền của bạn trong server',
                '👑 Nhờ admin cấp quyền cần thiết',
                '📖 Xem /help để biết quyền cần thiết'
            ],
            ERROR_TYPE_EMOJIS.permission
        );
        this.requiredPermission = requiredPermission;
    }
}

export class VoiceChannelPermissionError extends PermissionError {
    constructor(channelName = 'voice channel') {
        super(`Bot không có quyền vào kênh thoại "${channelName}"`, 'VIEW_CHANNEL, CONNECT, SPEAK');
        this.code = 'VOICE_PERMISSION_ERROR';
        this.emoji = ERROR_TYPE_EMOJIS.voice;
        this.suggestions = [
            '🔧 Nhờ admin kiểm tra quyền của bot',
            '✅ Bot cần: View Channel, Connect, Speak',
            '🔄 Thử kênh thoại khác'
        ];
    }
}

export class UserNotInVoiceError extends PermissionError {
    constructor() {
        super('Bạn cần vào một kênh thoại để sử dụng lệnh này');
        this.code = 'USER_NOT_IN_VOICE';
        this.severity = 'info';
        this.emoji = ERROR_TYPE_EMOJIS.voice;
        this.suggestions = ['🎤 Vào một kênh thoại trước', '🔄 Sau đó thử lại lệnh nhé!'];
    }
}

export class DifferentVoiceChannelError extends PermissionError {
    constructor() {
        super('Bạn cần ở cùng kênh thoại với bot');
        this.code = 'DIFFERENT_VOICE_CHANNEL';
        this.severity = 'warning';
        this.emoji = ERROR_TYPE_EMOJIS.voice;
        this.suggestions = ['🔊 Vào kênh thoại của bot', '⏹️ Hoặc /stop bot để bắt đầu lại ở kênh của bạn'];
    }
}

/**
 * Validation related errors
 */
export class ValidationError extends MiyaoError {
    constructor(message, field = null) {
        super(
            message,
            'VALIDATION_ERROR',
            'warning',
            [
                '📝 Kiểm tra lại thông tin đã nhập',
                '📖 Xem /help <lệnh> để biết cú pháp đúng',
                '🔄 Thử với giá trị khác'
            ],
            ERROR_TYPE_EMOJIS.validation
        );
        this.field = field;
    }
}

export class InvalidUrlError extends ValidationError {
    constructor(url = '') {
        const displayUrl = url.length > 50 ? url.slice(0, 50) + '...' : url;
        super(`Link không hợp lệ${displayUrl ? `: ${displayUrl}` : ''}`, 'url');
        this.code = 'INVALID_URL';
        this.emoji = '🔗';
        this.suggestions = [
            '✅ Dùng link từ YouTube, Spotify, hoặc SoundCloud',
            '🔍 Hoặc tìm kiếm bằng tên bài hát',
            '📋 Ví dụ: /play Anh Đã Quen Với Cô Đơn'
        ];
    }
}

export class InvalidVolumeError extends ValidationError {
    constructor(volume) {
        super(`Âm lượng "${volume}" không hợp lệ`, 'volume');
        this.code = 'INVALID_VOLUME';
        this.emoji = '🔊';
        this.suggestions = ['🔢 Dùng số từ 0 đến 100', '💡 Ví dụ: /volume 50', '🔇 0 = tắt tiếng, 🔊 100 = max'];
    }
}

export class InvalidPositionError extends ValidationError {
    constructor(position, max) {
        super(`Vị trí "${position}" không tồn tại trong queue`, 'position');
        this.code = 'INVALID_POSITION';
        this.emoji = '📍';
        this.suggestions = [
            `🔢 Dùng số từ 1 đến ${max}`,
            '📋 Xem /queue để biết vị trí có sẵn',
            '💡 Đếm từ 1 (bài đầu tiên = 1)'
        ];
    }
}

export class InvalidTimeError extends ValidationError {
    constructor(timeString) {
        super(`Thời gian "${timeString}" không hợp lệ`, 'time');
        this.code = 'INVALID_TIME';
        this.emoji = '⏱️';
        this.suggestions = [
            '📝 Định dạng: MM:SS hoặc HH:MM:SS',
            '💡 Ví dụ: 1:30, 02:45, 1:23:45',
            '🔢 Ví dụ: /seek 1:30 để tua đến phút 1:30'
        ];
    }
}

/**
 * Rate limit errors
 */
export class RateLimitError extends MiyaoError {
    constructor(retryAfter = 60) {
        super(
            `Bạn đang dùng lệnh hơi nhanh. Đợi ${retryAfter}s nhé!`,
            'RATE_LIMIT_EXCEEDED',
            'warning',
            [`⏱️ Đợi ${retryAfter} giây`, '🐢 Sử dụng lệnh từ từ hơn', '💡 Tip: Dùng các nút bấm thay vì lệnh'],
            ERROR_TYPE_EMOJIS.rateLimit
        );
        this.retryAfter = retryAfter;
    }
}

export class SearchRateLimitError extends RateLimitError {
    constructor() {
        super(30);
        this.code = 'SEARCH_RATE_LIMIT';
        this.suggestions = [
            '⏱️ Đợi 30 giây trước khi tìm tiếp',
            '🔗 Dùng URL trực tiếp thay vì tìm kiếm',
            '💾 Tạo playlist để không phải tìm lại'
        ];
    }
}

/**
 * Resource not found errors
 */
export class ResourceNotFoundError extends MiyaoError {
    constructor(message, resourceType = 'resource') {
        super(
            message,
            'RESOURCE_NOT_FOUND',
            'info',
            ['🔍 Kiểm tra lại tên/từ khóa', '📋 Xem danh sách có sẵn', '🔄 Thử với từ khóa khác'],
            ERROR_TYPE_EMOJIS.notFound
        );
        this.resourceType = resourceType;
    }
}

export class NoSearchResultsError extends ResourceNotFoundError {
    constructor(query = '') {
        const displayQuery = query.length > 30 ? query.slice(0, 30) + '...' : query;
        super(`Không tìm thấy: "${displayQuery}"`, 'search_results');
        this.code = 'NO_SEARCH_RESULTS';
        this.query = query;
        this.emoji = '🔍';
        this.suggestions = [
            '✏️ Kiểm tra chính tả',
            '🎤 Thêm tên nghệ sĩ: "Bài hát - Ca sĩ"',
            '🔗 Dùng link YouTube/Spotify trực tiếp',
            '🔥 Thử /trending để khám phá nhạc mới'
        ];
    }
}

export class TrackNotFoundError extends ResourceNotFoundError {
    constructor() {
        super('Không tìm thấy bài hát này', 'track');
        this.code = 'TRACK_NOT_FOUND';
        this.emoji = ERROR_TYPE_EMOJIS.track;
        this.suggestions = [
            '🔒 Video có thể đã bị xóa hoặc ẩn',
            '🔍 Thử tìm bằng tên bài hát',
            '📜 Xem /history để tìm bài đã nghe'
        ];
    }
}

export class PlaylistNotFoundError extends ResourceNotFoundError {
    constructor(playlistName = '') {
        const displayName = playlistName.length > 20 ? playlistName.slice(0, 20) + '...' : playlistName;
        super(`Không tìm thấy playlist "${displayName}"`, 'playlist');
        this.code = 'PLAYLIST_NOT_FOUND';
        this.emoji = ERROR_TYPE_EMOJIS.playlist;
        this.suggestions = [
            '📝 Kiểm tra tên playlist',
            '📋 Xem /playlist list để thấy playlist của bạn',
            '✨ Tạo mới với /playlist create <tên>'
        ];
    }
}

export class EmptyQueueError extends ResourceNotFoundError {
    constructor() {
        super('Chưa có bài nào trong hàng đợi', 'queue');
        this.code = 'EMPTY_QUEUE';
        this.severity = 'info';
        this.emoji = ERROR_TYPE_EMOJIS.queue;
        this.suggestions = [
            '🎵 Thêm bài với /play <tên bài>',
            '📁 Load playlist với /playlist play',
            '🔥 Khám phá nhạc mới với /trending'
        ];
    }
}

export class NothingPlayingError extends ResourceNotFoundError {
    constructor() {
        super('Hiện không có bài nào đang phát', 'current_track');
        this.code = 'NOTHING_PLAYING';
        this.severity = 'info';
        this.emoji = ERROR_TYPE_EMOJIS.player;
        this.suggestions = [
            '🎵 Phát nhạc với /play <tên bài>',
            '▶️ Nếu đã dừng, dùng /resume',
            '📋 Xem /queue để kiểm tra hàng đợi'
        ];
    }
}

export class NoPreviousTrackError extends ResourceNotFoundError {
    constructor() {
        super('Không có bài trước để quay lại', 'previous_track');
        this.code = 'NO_PREVIOUS_TRACK';
        this.severity = 'info';
        this.emoji = '⏮️';
        this.suggestions = [
            '🎵 Đây là bài đầu tiên trong phiên nghe',
            '📜 Xem /history để tìm bài đã nghe trước đó',
            '🔄 Bật loop nếu muốn nghe lại: /loop track'
        ];
    }
}

/**
 * Internal errors
 */
export class InternalError extends MiyaoError {
    constructor(message, originalError = null) {
        super(
            message,
            'INTERNAL_ERROR',
            'critical',
            [
                '🔄 Thử lại sau vài giây',
                '📞 Liên hệ admin nếu lỗi tiếp diễn',
                '⏰ Nhớ nói thời gian lỗi để admin kiểm tra'
            ],
            ERROR_TYPE_EMOJIS.internal
        );
        this.originalError = originalError;
    }
}

export class DatabaseError extends InternalError {
    constructor(operation = 'unknown', originalError = null) {
        super('Có lỗi khi xử lý dữ liệu', originalError);
        this.code = 'DATABASE_ERROR';
        this.emoji = ERROR_TYPE_EMOJIS.database;
        this.operation = operation;
        this.suggestions = [
            '🔄 Thử lại sau vài giây',
            '📞 Liên hệ admin nếu lỗi tiếp diễn',
            '💡 Dữ liệu của bạn vẫn an toàn!'
        ];
    }
}

export class PlayerError extends InternalError {
    constructor(message = 'Lỗi khi phát nhạc', originalError = null) {
        super(message, originalError);
        this.code = 'PLAYER_ERROR';
        this.emoji = ERROR_TYPE_EMOJIS.player;
        this.suggestions = [
            '⏹️ Thử /stop rồi /play lại',
            '🔄 Bài hát có thể tạm không khả dụng',
            '🎵 Thử bài khác nếu lỗi tiếp diễn'
        ];
    }
}

export class QueueFullError extends InternalError {
    constructor(maxSize = 100) {
        super(`Hàng đợi đã đầy (tối đa ${maxSize} bài)`);
        this.code = 'QUEUE_FULL';
        this.severity = 'warning';
        this.emoji = ERROR_TYPE_EMOJIS.queue;
        this.maxSize = maxSize;
        this.suggestions = [
            '🗑️ Xóa bớt bài với /clear hoặc /remove',
            '⏳ Đợi một số bài phát xong',
            '💾 Lưu queue vào playlist để dùng sau'
        ];
    }
}

export class FilterError extends MiyaoError {
    constructor(filterName = 'filter', reason = '') {
        super(
            `Không thể áp dụng filter "${filterName}"${reason ? `: ${reason}` : ''}`,
            'FILTER_ERROR',
            'warning',
            ['🎵 Đảm bảo có bài đang phát', '🔄 Thử tắt filter khác trước', '⏳ Đợi vài giây rồi thử lại'],
            '🎛️'
        );
        this.filterName = filterName;
    }
}

export class AutoplayError extends MiyaoError {
    constructor(reason = '') {
        super(
            `Không thể tìm bài phù hợp cho autoplay${reason ? `: ${reason}` : ''}`,
            'AUTOPLAY_ERROR',
            'info',
            [
                '📜 Nghe thêm để bot hiểu sở thích của bạn',
                '🔍 Thử /discover để khám phá nhạc mới',
                '📁 Tạo playlist yêu thích để autoplay tốt hơn'
            ],
            '🔄'
        );
    }
}

/**
 * Error severity levels
 */
export const ErrorSeverity = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical'
};

/**
 * Get color for error severity
 */
export function getErrorColor(severity) {
    switch (severity) {
        case ErrorSeverity.INFO:
            return COLORS.INFO;
        case ErrorSeverity.WARNING:
            return COLORS.WARNING;
        case ErrorSeverity.ERROR:
            return COLORS.ERROR;
        case ErrorSeverity.CRITICAL:
            return COLORS.SEVERITY.critical;
        default:
            return COLORS.MUTED;
    }
}

/**
 * Get emoji for error severity
 */
export function getErrorEmoji(severity) {
    switch (severity) {
        case ErrorSeverity.INFO:
            return 'ℹ️';
        case ErrorSeverity.WARNING:
            return '⚠️';
        case ErrorSeverity.ERROR:
            return '❌';
        case ErrorSeverity.CRITICAL:
            return '🚨';
        default:
            return '❓';
    }
}

/**
 * Wrap async function with error handling
 */
export function withErrorHandling(fn, _context = 'operation') {
    return async function (...args) {
        try {
            return await fn.apply(this, args);
        } catch (error) {
            // If it's already a MiyaoError, rethrow
            if (error instanceof MiyaoError) {
                throw error;
            }

            // Wrap unknown errors
            throw new InternalError('Đã xảy ra lỗi không mong muốn', error);
        }
    };
}

/**
 * Create user-friendly error response
 */
export function formatErrorForUser(error) {
    if (!(error instanceof MiyaoError)) {
        error = new InternalError('Đã xảy ra lỗi không mong muốn', error);
    }

    return {
        title: `${error.emoji || getErrorEmoji(error.severity)} ${error.code.replace(/_/g, ' ')}`,
        description: error.message,
        color: getErrorColor(error.severity),
        suggestions: error.suggestions,
        timestamp: error.timestamp,
        severity: error.severity,
        emoji: error.emoji
    };
}

/**
 * Create a friendly error message string
 */
export function formatErrorMessage(error) {
    if (!(error instanceof MiyaoError)) {
        return '❌ Đã xảy ra lỗi không mong muốn. Vui lòng thử lại!';
    }

    let message = `${error.emoji || '❌'} **${error.message}**\n\n`;

    if (error.suggestions && error.suggestions.length > 0) {
        message += '**💡 Bạn có thể thử:**\n';
        message += error.suggestions.map(s => `• ${s}`).join('\n');
    }

    return message;
}

export default {
    MiyaoError,
    NetworkError,
    LavalinkConnectionError,
    LavalinkNodeUnavailableError,
    PermissionError,
    VoiceChannelPermissionError,
    UserNotInVoiceError,
    DifferentVoiceChannelError,
    ValidationError,
    InvalidUrlError,
    InvalidVolumeError,
    InvalidPositionError,
    InvalidTimeError,
    RateLimitError,
    SearchRateLimitError,
    ResourceNotFoundError,
    NoSearchResultsError,
    TrackNotFoundError,
    PlaylistNotFoundError,
    EmptyQueueError,
    NothingPlayingError,
    NoPreviousTrackError,
    InternalError,
    DatabaseError,
    PlayerError,
    QueueFullError,
    FilterError,
    AutoplayError,
    ErrorSeverity,
    getErrorColor,
    getErrorEmoji,
    withErrorHandling,
    formatErrorForUser,
    formatErrorMessage
};
