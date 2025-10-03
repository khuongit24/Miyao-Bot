# 🎵 Miyao Music Bot

<div align="center">

![Version](https://img.shields.io/badge/version-1.4.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)


[Features](#-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Support](#-support)

</div>

---

## 📋 Table of Contents

- [Features](#-features)
- [What's New in v1.4.0](#-whats-new-in-v140)
- [Quick Start](#-quick-start)
- [System Requirements](#-system-requirements)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [Commands](#-commands)
- [Documentation](#-documentation)
- [Troubleshooting](#-troubleshooting)
- [Support](#-support)
- [License](#-license)

---

## ✨ Features

### � Unified Launcher (NEW v2.0!)
- **Single executable** - One file để start toàn bộ bot (`MiyaoLauncher.exe`)
- **Automatic validation** - Pre-flight checks cho mọi requirements
- **Smart startup** - Auto-start Lavalink → Deploy → Bot sequence
- **Intelligent memory** - Dynamic RAM allocation based on system
- **Real-time monitoring** - Live logs với color-coded output
- **Error recovery** - Advanced error handling với suggested solutions
- **Zero configuration** - Works out-of-the-box after .env setup
- **50-80% smaller** - Compared to old Electron launcher

### �🖥️ Desktop Launcher (Legacy - Still Available)
- **One-click management** - Start/stop bot với một click
- **Real-time terminals** - Xem logs của Lavalink và Bot trực tiếp
- **Visual config editor** - Chỉnh sửa config.json trong giao diện
- **Settings manager** - Quản lý .env file dễ dàng
- **Modern UI** - Glassmorphism design với gradient màu tím/hồng
- **Auto-login** - Tự động detect credentials từ .env

### 🎵 Music System
- **42 Commands** - 21 slash commands + 21 prefix commands
- **High-quality audio** - Lavalink v4 streaming
- **Multi-source support** - YouTube, Spotify, SoundCloud, Bandcamp
- **Advanced filters** - 12+ audio effects (nightcore, bassboost, 8D, etc.)
- **Queue management** - Unlimited queue with pagination
- **Playlist support** - Load entire playlists at once

### 🎨 Modern UI/UX
- **Interactive seek buttons** - Tua nhạc trực tiếp từ progress bar (⏪ ◀️ 🔄 ▶️ ⏩)
- **Interactive buttons** - Control music với buttons
- **Dropdown menus** - Song selection, help categories
- **Auto-updates** - Now playing embed tự động cập nhật
- **Progress bars** - Hiển thị tiến độ phát nhạc
- **Rich embeds** - Beautiful Discord embeds
- **Feedback system** - Built-in feedback và bug report forms

### 🛠️ Developer Features
- **Clean architecture** - Modular code structure
- **Comprehensive logging** - Winston logging system
- **Error handling** - Robust error recovery
- **Easy deployment** - Automated scripts
- **Well documented** - 25+ documentation files

---

## 🚀 Quick Start

**Windows:**
```batch
# Terminal 1 - Start Lavalink
.\start-lavalink.bat

# Terminal 2 - Deploy commands (first time only)
.\deploy.bat

# Terminal 3 - Start bot
.\start-bot.bat
```

**Linux/macOS:**
```bash
# Terminal 1
java -jar Lavalink.jar

# Terminal 2
npm run deploy

# Terminal 3
npm start
```

---


## 💻 System Requirements

### Minimum
- **OS**: Windows 10, macOS 10.13, Ubuntu 18.04
- **Node.js**: 18.0.0 or higher
- **Java**: 11 or higher (for Lavalink)
- **RAM**: 2 GB
- **Disk**: 500 MB

### Recommended
- **OS**: Windows 11, macOS 12+, Ubuntu 22.04
- **Node.js**: 20.0.0 or higher
- **Java**: 17 or higher
- **RAM**: 4 GB
- **Disk**: 1 GB

---

## 📦 Installation

### Step 1: Prerequisites

Install Node.js 18+ from [nodejs.org](https://nodejs.org/)  
Install Java 11+ from [adoptium.net](https://adoptium.net/)

### Step 2: Install Dependencies

```bash
npm install
cd launcher
npm install
cd ..
```

### Step 3: Configuration

1. **Create .env file:**
```bash
copy .env.example .env  # Windows
cp .env.example .env    # Linux/Mac
```

2. **Edit .env với Discord credentials:**
```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here  # Optional for testing
LAVALINK_PASSWORD=youshallnotpass
```

3. **Configure bot settings (optional):**
Edit `config/config.json` for customization.

### Step 4: Deploy Commands

```bash
npm run deploy
```

### Step 5: Start Bot

**Option A - Desktop Launcher:**
```bash
cd launcher
npm start
```

**Option B - Manual:**
```bash
# Terminal 1: Start Lavalink
java -jar Lavalink.jar

# Terminal 2: Start Bot
npm start
```

**Option C - Batch Scripts (Windows):**
```batch
start-lavalink.bat  # Start Lavalink
start-bot.bat       # Start Bot
```

---

## ⚙️ Configuration

### Environment Variables (.env)

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here  # Optional

# Lavalink Configuration
LAVALINK_PASSWORD=youshallnotpass

# Environment
NODE_ENV=production
```

### Bot Settings (config/config.json)

```json
{
  "bot": {
    "name": "Miyao",
    "prefix": "!",
    "color": "#5865F2",
    "activity": "🎵 /help for commands"
  },
  "lavalink": {
    "host": "127.0.0.1",
    "port": 2333,
    "password": "youshallnotpass",
    "secure": false
  },
  "music": {
    "maxQueueSize": 100,
    "defaultVolume": 50,
    "autoLeaveEmpty": true,
    "autoLeaveEmptyDelay": 300000
  }
}
```

---

## 🎮 Usage

### Slash Commands
```
/play <song>     - Play a song
/pause           - Pause playback
/resume          - Resume playback
/skip            - Skip current song
/stop            - Stop and clear queue
/queue           - Show queue
/nowplaying      - Show current song
/volume <0-100>  - Set volume
/loop <mode>     - Set loop mode
/help            - Show help menu
```

### Prefix Commands
```
!play <song>     - Play a song
!pause           - Pause playback
!resume          - Resume playback
!skip            - Skip current song
!stop            - Stop and clear queue
!queue           - Show queue
!np              - Show current song
!volume <0-100>  - Set volume
!loop <mode>     - Set loop mode
!help            - Show help menu
```

---

## 📚 Commands

### Music Playback
- `/play <query>` - Play music from YouTube, Spotify, SoundCloud
- `/pause` - Pause current track
- `/resume` - Resume playback
- `/skip` - Skip to next track
- `/stop` - Stop playback and clear queue

### Queue Management
- `/queue` - Display current queue with pagination
- `/shuffle` - Shuffle the queue
- `/clear` - Clear entire queue
- `/remove <position>` - Remove track at position
- `/move <from> <to>` - Move track to different position
- `/jump <position>` - Jump to specific track

### Audio Control
- `/volume <0-100>` - Adjust volume
- `/loop <off|track|queue>` - Set loop mode
- `/seek <time>` - Seek to specific time
- `/filter <type>` - Apply audio filters

### Information
- `/nowplaying` - Show current track with interactive buttons
- `/help` - Interactive help menu with categories
- `/ping` - Check bot latency
- `/stats` - Bot performance statistics
- `/nodes` - Lavalink node information
- `/history` - Recently played tracks

---

## 📖 Documentation

### User Guides
- **[SETUP.md](docs/SETUP.md)** - Complete setup guide
- **[FAQ.md](docs/FAQ.md)** - Frequently asked questions
- **[RELEASE_NOTES.md](docs/RELEASE_NOTES.md)** - What's new in v1.2.0
- **[CHANGELOG.md](docs/CHANGELOG.md)** - Version history

### Technical Documentation
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System architecture
- **[launcher/USER_GUIDE.md](launcher/USER_GUIDE.md)** - Launcher guide
- **[launcher/BUILD_GUIDE.md](launcher/BUILD_GUIDE.md)** - Building launcher

### Quick References
- **[RELEASE_GUIDE_VI.md](docs/RELEASE_GUIDE_VI.md)** - Hướng dẫn chi tiết (Tiếng Việt)

---

## 🔧 Troubleshooting

### Bot không start

**Kiểm tra:**
1. Node.js version >= 18
2. Java version >= 11
3. .env file có đúng token
4. Lavalink đang chạy

**Giải pháp:**
```bash
# Check versions
node --version
java -version

# Verify .env
cat .env  # Linux/Mac
type .env # Windows

# Restart Lavalink
java -jar Lavalink.jar
```

### Commands không hoạt động

**Nguyên nhân:** Chưa deploy commands

**Giải pháp:**
```bash
npm run deploy
```

### Music không phát

**Kiểm tra:**
1. Lavalink server đang chạy?
2. Port 2333 có bị block không?
3. Password trong .env khớp với application.yml?

**Giải pháp:**
```bash
# Check Lavalink logs
tail -f logs/spring.log

# Verify connection
curl http://localhost:2333/version
```

### Launcher không mở

**Nguyên nhân:** Chưa install launcher dependencies

**Giải pháp:**
```bash
cd launcher
npm install
npm start
```

---

## 💬 Support

### Getting Help
- **Documentation**: Check `docs/` folder
- **FAQ**: Read [FAQ.md](docs/FAQ.md)
- **Issues**: [GitHub Issues](https://github.com/khuongit24/miyao-bot/issues)

### Reporting Bugs
Use built-in feedback system in bot or create GitHub issue with:
- Bot version (1.3.0)
- Error logs
- Steps to reproduce
- Expected vs actual behavior

### Community
- **Discord**: [Join our server](https://discord.gg/your-invite)
- **GitHub**: [Repository](https://github.com/khuongit24)

---

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines.

### Development Setup
```bash
# Clone repository
git clone https://github.com/khuongit24/miyao-bot.git
cd miyao-bot

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env

# Start development
npm run dev
```

---

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Credits

### Technologies
- **Discord.js v14** - Discord API wrapper
- **Shoukaku v4** - Lavalink client
- **Lavalink v4** - Audio streaming server
- **Electron v28** - Desktop framework
- **Winston v3** - Logging system

### Special Thanks
- Discord.js community
- Shoukaku developers
- Lavalink team

---

## 📊 Statistics

- **Version**: 1.3.0
- **Release Date**: October 3, 2025
- **Commands**: 42 (21 slash + 21 prefix)
- **Lines of Code**: ~15,000
- **Documentation**: 25+ files
- **Support**: Active development

---

<div align="center">

[⭐ Star us on GitHub](https://github.com/khuongit24) • [🐛 Report Bug](https://github.com/khuongit24/issues) • [💡 Request Feature](https://github.com/khuongit24/issues)


</div>

