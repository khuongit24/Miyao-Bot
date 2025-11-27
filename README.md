# 🎵 Miyao Music Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue)](https://discord.js.org/)
[![Version](https://img.shields.io/badge/version-1.8.0-blue)](https://github.com/khuongit24/Miyao-Bot)

**Miyao Music Bot** là một Discord Music Bot mạnh mẽ, được xây dựng với Discord.js v14 và Lavalink, hỗ trợ phát nhạc từ nhiều nguồn khác nhau như YouTube, Spotify, SoundCloud và nhiều hơn nữa.

> 📚 *Mã nguồn được công khai với mục đích học tập và tham khảo.*

---

## 📋 Mục lục

- [✨ Tính năng](#-tính-năng)
- [📦 Yêu cầu hệ thống](#-yêu-cầu-hệ-thống)
- [🚀 Cài đặt](#-cài-đặt)
- [⚙️ Cấu hình](#️-cấu-hình)
- [🎮 Danh sách lệnh](#-danh-sách-lệnh)
- [📁 Cấu trúc dự án](#-cấu-trúc-dự-án)
- [🛠️ Phát triển](#️-phát-triển)
- [🤝 Đóng góp](#-đóng-góp)
- [📄 Giấy phép](#-giấy-phép)

---

## ✨ Tính năng

### 🎶 Phát nhạc
- Phát nhạc từ **YouTube**, **Spotify**, **SoundCloud**, **Bandcamp**, **Twitch**, **Vimeo**
- Hỗ trợ tìm kiếm và phát playlist
- Điều khiển phát nhạc: play, pause, resume, skip, stop, seek
- Điều chỉnh âm lượng (0-100%)

### 📜 Quản lý hàng đợi
- Xem danh sách hàng đợi với phân trang
- Xáo trộn (shuffle), lặp lại (loop) bài hát/playlist
- Di chuyển, xóa, nhảy đến bài hát bất kỳ
- Xóa toàn bộ hàng đợi

### 🎛️ Bộ lọc âm thanh
- **12+ bộ lọc**: bassboost, nightcore, vaporwave, 8D, karaoke, tremolo, vibrato, ...
- Chế độ **Autoplay** - tự động phát bài tương tự khi hết hàng đợi

### 📚 Playlist & Yêu thích
- Tạo và quản lý playlist cá nhân
- Lưu bài hát yêu thích
- Import/Export playlist

### 🔍 Khám phá nhạc
- Tìm bài hát tương tự
- Xem trending music
- Khám phá nhạc mới
- Hiển thị lời bài hát (lyrics)

### 📊 Thống kê
- Thống kê cá nhân và server
- Lịch sử nghe nhạc
- Bảng xếp hạng (leaderboard)

### 🎯 Tính năng khác
- **Music Quiz** - Trò chơi đoán tên bài hát
- **Context Menu** - Click chuột phải để thêm bài hát
- **Health Check** - Giám sát sức khỏe hệ thống
- **Metrics API** - Theo dõi hiệu suất
- **Graceful Degradation** - Xử lý lỗi thông minh

---

## 📦 Yêu cầu hệ thống

| Yêu cầu | Phiên bản |
|---------|-----------|
| **Node.js** | ≥ 20.0.0 |
| **Java** | ≥ 17 (cho Lavalink) |
| **npm** | Đi kèm Node.js |
| **Lavalink** | ≥ 4.0.0 |

---

## 🚀 Cài đặt

### Bước 1: Clone repository

```bash
git clone https://github.com/khuongit24/Miyao-Bot.git
cd Miyao-Bot
```

### Bước 2: Cài đặt dependencies

**Linux/macOS:**
```bash
chmod +x install-unix.sh
./install-unix.sh
```

**Windows:**
```cmd
npm install
cd launcher && npm install && cd ..
```

**Hoặc cài đặt thủ công:**
```bash
npm install
```

### Bước 3: Tải Lavalink

1. Tải [Lavalink.jar](https://github.com/lavalink-devs/Lavalink/releases) (phiên bản mới nhất)
2. Đặt file `Lavalink.jar` vào thư mục gốc của bot

### Bước 4: Cấu hình

1. Tạo file `.env` từ template:
```bash
cp .env.example .env
```

2. Chỉnh sửa file `.env` với thông tin của bạn:
```env
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_bot_client_id
GUILD_ID=your_test_guild_id

# Spotify (tùy chọn)
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
```

### Bước 5: Deploy Commands

```bash
npm run deploy
```

### Bước 6: Khởi động

**Khởi động Lavalink:**
```bash
java -jar Lavalink.jar
```

**Khởi động Bot:**
```bash
npm start
```

**Hoặc sử dụng Desktop Launcher:**
```bash
cd launcher
npm start
```

---

## ⚙️ Cấu hình

### File `.env`

| Biến | Mô tả | Bắt buộc |
|------|-------|----------|
| `DISCORD_TOKEN` | Token của Discord Bot | ✅ |
| `CLIENT_ID` | Client ID của Bot | ✅ |
| `GUILD_ID` | Guild ID để test (development) | ❌ |
| `SPOTIFY_CLIENT_ID` | Spotify Client ID | ❌ |
| `SPOTIFY_CLIENT_SECRET` | Spotify Client Secret | ❌ |
| `NODE_ENV` | Môi trường (development/production) | ❌ |
| `LOG_LEVEL` | Mức độ log (debug/info/warn/error) | ❌ |
| `CACHE_BUDGET_MB` | Dung lượng cache (MB) | ❌ |

### File `src/config/config.json`

```json
{
  "bot": {
    "name": "Miyao",
    "prefix": "!",
    "color": "#FF69B4"
  },
  "music": {
    "defaultVolume": 50,
    "maxVolume": 100,
    "maxQueueSize": 100,
    "leaveOnEmpty": true,
    "leaveOnEmptyDelay": 300000
  },
  "lavalink": {
    "nodes": [{
      "name": "Main Node",
      "url": "127.0.0.1:2333",
      "auth": "youshallnotpass"
    }]
  }
}
```

> ⚠️ **Bảo mật**: Nếu triển khai production, hãy thay đổi mật khẩu mặc định `youshallnotpass` trong cả `config.json` và `application.yml`.

### File `application.yml` (Lavalink)

File cấu hình Lavalink đã được setup sẵn với:
- YouTube plugin (youtube-plugin)
- LavaSrc plugin (Spotify, SoundCloud, Apple Music)
- Các bộ lọc âm thanh

---

## 🎮 Danh sách lệnh

### 🎵 Nhạc (Music)
| Lệnh | Mô tả |
|------|-------|
| `/play <query>` | Phát nhạc từ link hoặc tìm kiếm |
| `/pause` | Tạm dừng phát nhạc |
| `/resume` | Tiếp tục phát nhạc |
| `/skip` | Bỏ qua bài hiện tại |
| `/stop` | Dừng phát và xóa hàng đợi |
| `/nowplaying` | Xem bài đang phát |
| `/seek <time>` | Tua đến thời điểm |
| `/volume <0-100>` | Điều chỉnh âm lượng |

### 📜 Hàng đợi (Queue)
| Lệnh | Mô tả |
|------|-------|
| `/queue` | Xem hàng đợi |
| `/shuffle` | Xáo trộn hàng đợi |
| `/loop <mode>` | Lặp lại (off/track/queue) |
| `/remove <position>` | Xóa bài khỏi hàng đợi |
| `/move <from> <to>` | Di chuyển bài trong hàng đợi |
| `/jump <position>` | Nhảy đến bài |
| `/clear` | Xóa toàn bộ hàng đợi |

### 🎛️ Bộ lọc (Filters)
| Lệnh | Mô tả |
|------|-------|
| `/filter <type>` | Áp dụng bộ lọc âm thanh |
| `/autoplay` | Bật/tắt autoplay |

### 📚 Playlist
| Lệnh | Mô tả |
|------|-------|
| `/playlist create <name>` | Tạo playlist mới |
| `/playlist add <name>` | Thêm bài vào playlist |
| `/playlist play <name>` | Phát playlist |
| `/playlist list` | Xem danh sách playlist |
| `/favorites` | Quản lý bài hát yêu thích |

### 🔍 Khám phá (Discovery)
| Lệnh | Mô tả |
|------|-------|
| `/lyrics` | Xem lời bài hát |
| `/similar` | Tìm bài tương tự |
| `/trending` | Xem nhạc trending |
| `/discover` | Khám phá nhạc mới |

### 📊 Thống kê (Stats)
| Lệnh | Mô tả |
|------|-------|
| `/stats` | Thống kê bot |
| `/mystats` | Thống kê cá nhân |
| `/serverstats` | Thống kê server |
| `/history` | Lịch sử nghe nhạc |
| `/leaderboard` | Bảng xếp hạng |

### 🎯 Khác
| Lệnh | Mô tả |
|------|-------|
| `/help` | Xem trợ giúp |
| `/ping` | Kiểm tra độ trễ |
| `/quiz` | Chơi đoán tên bài hát |
| `/feedback` | Gửi phản hồi |
| `/settings` | Cài đặt server |

---

## 📁 Cấu trúc dự án

```
Miyao-Bot/
├── 📄 index.js              # Entry point
├── 📄 package.json          # Dependencies & scripts
├── 📄 application.yml       # Cấu hình Lavalink
├── 📁 src/
│   ├── 📁 commands/         # Slash commands
│   │   ├── admin/           # Lệnh quản trị
│   │   ├── discovery/       # Lệnh khám phá
│   │   ├── filters/         # Lệnh bộ lọc
│   │   ├── music/           # Lệnh nhạc
│   │   ├── playlist/        # Lệnh playlist
│   │   ├── queue/           # Lệnh hàng đợi
│   │   ├── settings/        # Lệnh cài đặt
│   │   ├── social/          # Lệnh xã hội
│   │   └── stats/           # Lệnh thống kê
│   ├── 📁 config/           # Cấu hình bot
│   ├── 📁 database/         # Quản lý SQLite
│   ├── 📁 events/           # Discord events
│   ├── 📁 music/            # Music Manager (Shoukaku)
│   ├── 📁 services/         # Services (cache, etc.)
│   ├── 📁 utils/            # Utilities & helpers
│   ├── 📁 api/              # Metrics API server
│   └── 📁 scripts/          # Deploy scripts
├── 📁 launcher/             # Desktop Launcher (Electron)
├── 📁 plugins/              # Lavalink plugins
├── 📁 data/                 # Database files
└── 📁 logs/                 # Log files
```

---

## 🛠️ Phát triển

### Scripts có sẵn

```bash
# Chạy bot
npm start

# Chạy với watch mode
npm run dev

# Deploy slash commands
npm run deploy

# Xóa commands
npm run clear-commands

# Chạy tests
npm test

# Chạy tests với coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format
```

### Tech Stack

- **Runtime**: Node.js 20+
- **Discord Library**: discord.js v14
- **Audio**: Lavalink + Shoukaku
- **Database**: SQLite (better-sqlite3)
- **Logging**: Winston
- **Testing**: Jest
- **API**: Express.js

---

## 🤝 Đóng góp

Mọi đóng góp đều được hoan nghênh! Vui lòng:

1. Fork repository
2. Tạo branch mới (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Tạo Pull Request

---

## 📄 Giấy phép

Dự án được phát hành dưới giấy phép **MIT License**.

Xem file [LICENSE](LICENSE) để biết thêm chi tiết.

---

## 👤 Tác giả

**Trần Tuấn Khương** - [@khuongit24](https://github.com/khuongit24)

---

