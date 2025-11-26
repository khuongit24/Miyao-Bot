/**
 * Error Handling System
 * Comprehensive error taxonomy with user-friendly messages
 * @module errors
 */

/**
 * Base Error Class
 */
export class MiyaoError extends Error {
    constructor(message, code, severity = 'error', suggestions = []) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.severity = severity; // 'info', 'warning', 'error', 'critical'
        this.suggestions = suggestions;
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
            timestamp: this.timestamp
        };
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
            [
                'Kiểm tra kết nối internet',
                'Thử lại sau vài giây',
                'Liên hệ admin nếu lỗi tiếp diễn'
            ]
        );
        this.details = details;
    }
}

export class LavalinkConnectionError extends NetworkError {
    constructor(nodeUrl = 'unknown') {
        super(
            `Không thể kết nối đến Lavalink node: ${nodeUrl}`,
            { nodeUrl }
        );
        this.code = 'LAVALINK_CONNECTION_ERROR';
        this.suggestions = [
            'Đảm bảo Lavalink server đang chạy',
            'Kiểm tra cấu hình trong config.json',
            'Kiểm tra firewall và port',
            'Xem log của Lavalink để biết chi tiết'
        ];
    }
}

export class LavalinkNodeUnavailableError extends NetworkError {
    constructor(availableNodes = 0) {
        super(
            `Tất cả Lavalink nodes không khả dụng (${availableNodes} nodes)`,
            { availableNodes }
        );
        this.code = 'LAVALINK_NODES_UNAVAILABLE';
        this.severity = 'critical';
        this.suggestions = [
            'Khởi động lại Lavalink servers',
            'Kiểm tra logs/spring.log để xem lỗi',
            'Đảm bảo ít nhất 1 node đang hoạt động',
            'Liên hệ admin ngay lập tức'
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
                'Kiểm tra quyền của bạn trong server',
                'Yêu cầu admin cấp quyền cần thiết',
                'Xem /help để biết quyền cần thiết cho mỗi lệnh'
            ]
        );
        this.requiredPermission = requiredPermission;
    }
}

export class VoiceChannelPermissionError extends PermissionError {
    constructor(channelName = 'voice channel') {
        super(
            `Bot không có quyền truy cập vào ${channelName}`,
            'VIEW_CHANNEL, CONNECT, SPEAK'
        );
        this.code = 'VOICE_PERMISSION_ERROR';
        this.suggestions = [
            'Đảm bảo bot có quyền "View Channel"',
            'Đảm bảo bot có quyền "Connect"',
            'Đảm bảo bot có quyền "Speak"',
            'Kiểm tra role của bot và permissions của channel'
        ];
    }
}

export class UserNotInVoiceError extends PermissionError {
    constructor() {
        super(
            'Bạn cần tham gia một voice channel để sử dụng lệnh này'
        );
        this.code = 'USER_NOT_IN_VOICE';
        this.severity = 'info';
        this.suggestions = [
            'Tham gia một voice channel trước',
            'Sau đó thử lại lệnh'
        ];
    }
}

export class DifferentVoiceChannelError extends PermissionError {
    constructor() {
        super(
            'Bạn phải ở cùng voice channel với bot'
        );
        this.code = 'DIFFERENT_VOICE_CHANNEL';
        this.severity = 'warning';
        this.suggestions = [
            'Tham gia voice channel của bot',
            'Hoặc dừng bot và bắt đầu lại trong channel của bạn'
        ];
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
                'Kiểm tra lại input của bạn',
                'Xem /help <command> để biết cú pháp đúng',
                'Thử với giá trị khác'
            ]
        );
        this.field = field;
    }
}

export class InvalidUrlError extends ValidationError {
    constructor(url = '') {
        super(
            `URL không hợp lệ: ${url}`,
            'url'
        );
        this.code = 'INVALID_URL';
        this.suggestions = [
            'Đảm bảo URL bắt đầu với http:// hoặc https://',
            'Kiểm tra URL có hợp lệ không',
            'Thử với URL từ YouTube, Spotify, hoặc SoundCloud',
            'Hoặc tìm kiếm trực tiếp bằng từ khóa'
        ];
    }
}

export class InvalidVolumeError extends ValidationError {
    constructor(volume) {
        super(
            `Âm lượng không hợp lệ: ${volume}. Cho phép từ 0-100`,
            'volume'
        );
        this.code = 'INVALID_VOLUME';
        this.suggestions = [
            'Sử dụng số từ 0 đến 100',
            'Ví dụ: /volume 50',
            '0 = tắt tiếng, 100 = âm lượng tối đa'
        ];
    }
}

export class InvalidPositionError extends ValidationError {
    constructor(position, max) {
        super(
            `Vị trí không hợp lệ: ${position}. Cho phép từ 1-${max}`,
            'position'
        );
        this.code = 'INVALID_POSITION';
        this.suggestions = [
            `Sử dụng số từ 1 đến ${max}`,
            'Xem /queue để kiểm tra các vị trí có sẵn',
            'Đếm từ 1 (không phải 0)'
        ];
    }
}

export class InvalidTimeError extends ValidationError {
    constructor(timeString) {
        super(
            `Thời gian không hợp lệ: ${timeString}`,
            'time'
        );
        this.code = 'INVALID_TIME';
        this.suggestions = [
            'Sử dụng định dạng: MM:SS hoặc HH:MM:SS',
            'Ví dụ: 1:30, 02:45, 1:23:45',
            'Hoặc số giây: 90 (cho 1 phút 30 giây)'
        ];
    }
}

/**
 * Rate limit errors
 */
export class RateLimitError extends MiyaoError {
    constructor(retryAfter = 60) {
        super(
            `Bạn đang sử dụng lệnh quá nhanh. Thử lại sau ${retryAfter} giây`,
            'RATE_LIMIT_EXCEEDED',
            'warning',
            [
                `Đợi ${retryAfter} giây`,
                'Tránh spam lệnh',
                'Sử dụng bot một cách hợp lý'
            ]
        );
        this.retryAfter = retryAfter;
    }
}

export class SearchRateLimitError extends RateLimitError {
    constructor() {
        super(30);
        this.code = 'SEARCH_RATE_LIMIT';
        this.suggestions = [
            'Đợi 30 giây trước khi tìm kiếm tiếp',
            'Sử dụng URL trực tiếp thay vì tìm kiếm',
            'Cân nhắc tạo playlist để tái sử dụng'
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
            [
                'Kiểm tra lại tên/ID',
                'Xem danh sách có sẵn',
                'Thử với từ khóa khác'
            ]
        );
        this.resourceType = resourceType;
    }
}

export class NoSearchResultsError extends ResourceNotFoundError {
    constructor(query = '') {
        super(
            `Không tìm thấy kết quả cho: "${query}"`,
            'search_results'
        );
        this.code = 'NO_SEARCH_RESULTS';
        this.query = query;
        this.suggestions = [
            'Kiểm tra chính tả',
            'Thử với từ khóa khác',
            'Sử dụng tên đầy đủ của bài hát',
            'Thêm tên nghệ sĩ vào tìm kiếm',
            'Sử dụng URL trực tiếp từ YouTube/Spotify'
        ];
    }
}

export class TrackNotFoundError extends ResourceNotFoundError {
    constructor(identifier = '') {
        super(
            `Không tìm thấy bài hát: ${identifier}`,
            'track'
        );
        this.code = 'TRACK_NOT_FOUND';
        this.suggestions = [
            'Kiểm tra URL có đúng không',
            'Video có thể đã bị xóa hoặc private',
            'Thử tìm kiếm bằng tên bài hát',
            'Xem /history để tìm bài đã phát trước đó'
        ];
    }
}

export class PlaylistNotFoundError extends ResourceNotFoundError {
    constructor(playlistName = '') {
        super(
            `Không tìm thấy playlist: "${playlistName}"`,
            'playlist'
        );
        this.code = 'PLAYLIST_NOT_FOUND';
        this.suggestions = [
            'Kiểm tra tên playlist',
            'Xem /playlist list để xem tất cả playlist',
            'Tạo playlist mới với /playlist create'
        ];
    }
}

export class EmptyQueueError extends ResourceNotFoundError {
    constructor() {
        super(
            'Hàng đợi đang trống',
            'queue'
        );
        this.code = 'EMPTY_QUEUE';
        this.severity = 'info';
        this.suggestions = [
            'Thêm bài hát với /play <query>',
            'Load playlist với /playlist play <name>',
            'Xem /help play để biết thêm'
        ];
    }
}

export class NothingPlayingError extends ResourceNotFoundError {
    constructor() {
        super(
            'Không có gì đang phát',
            'current_track'
        );
        this.code = 'NOTHING_PLAYING';
        this.severity = 'info';
        this.suggestions = [
            'Phát nhạc với /play <query>',
            'Tiếp tục với /resume nếu đã tạm dừng',
            'Xem /queue để kiểm tra hàng đợi'
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
                'Thử lại sau vài phút',
                'Nếu lỗi tiếp diễn, liên hệ admin',
                'Cung cấp thời gian lỗi để admin kiểm tra logs'
            ]
        );
        this.originalError = originalError;
    }
}

export class DatabaseError extends InternalError {
    constructor(operation = 'unknown', originalError = null) {
        super(
            `Lỗi database khi thực hiện: ${operation}`,
            originalError
        );
        this.code = 'DATABASE_ERROR';
        this.operation = operation;
        this.suggestions = [
            'Thử lại sau vài giây',
            'Nếu lỗi tiếp diễn, database có thể bị lỗi',
            'Liên hệ admin để kiểm tra',
            'Admin: Kiểm tra logs và xem xét backup'
        ];
    }
}

export class PlayerError extends InternalError {
    constructor(message = 'Lỗi player', originalError = null) {
        super(message, originalError);
        this.code = 'PLAYER_ERROR';
        this.suggestions = [
            'Thử dừng và phát lại: /stop rồi /play',
            'Kiểm tra xem bot còn trong voice channel không',
            'Thử với bài hát khác',
            'Nếu lỗi tiếp diễn, có thể là lỗi Lavalink'
        ];
    }
}

export class QueueFullError extends InternalError {
    constructor(maxSize = 1000) {
        super(
            `Hàng đợi đã đầy (tối đa ${maxSize} bài)`
        );
        this.code = 'QUEUE_FULL';
        this.severity = 'warning';
        this.maxSize = maxSize;
        this.suggestions = [
            'Xóa bớt bài hát với /clear hoặc /remove',
            'Đợi một số bài hát phát xong',
            'Tạo playlist riêng cho các bài còn lại'
        ];
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
            return '#3498db'; // Blue
        case ErrorSeverity.WARNING:
            return '#f39c12'; // Orange
        case ErrorSeverity.ERROR:
            return '#e74c3c'; // Red
        case ErrorSeverity.CRITICAL:
            return '#c0392b'; // Dark red
        default:
            return '#95a5a6'; // Gray
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
export function withErrorHandling(fn, context = 'operation') {
    return async function(...args) {
        try {
            return await fn.apply(this, args);
        } catch (error) {
            // If it's already a MiyaoError, rethrow
            if (error instanceof MiyaoError) {
                throw error;
            }
            
            // Wrap unknown errors
            throw new InternalError(
                `Lỗi không xác định trong ${context}`,
                error
            );
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
        title: `${getErrorEmoji(error.severity)} Lỗi: ${error.code}`,
        description: error.message,
        color: getErrorColor(error.severity),
        suggestions: error.suggestions,
        timestamp: error.timestamp,
        severity: error.severity
    };
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
    InternalError,
    DatabaseError,
    PlayerError,
    QueueFullError,
    ErrorSeverity,
    getErrorColor,
    getErrorEmoji,
    withErrorHandling,
    formatErrorForUser
};
