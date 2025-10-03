# 🎵 Miyao Music Bot

<div align="center">

![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Status](https://img.shields.io/badge/status-stable-success.svg)

[Chức năng](#-chức-năng) • [Bắt đầu nhanh](#-bắt-đầu-nhanh) • [Tài liệu](#-tài-liệu) • [Hỗ trợ](#-hỗ-trợ)

</div>

---

## 📋 Mục Lục

- [Chức năng](#-chức-năng)
- [Bắt đầu nhanh](#-bắt-đầu-nhanh)
- [Yêu cầu hệ thống](#-yêu-cầu-hệ-thống)
- [Cài đặt](#-cài-đặt)
- [Cấu hình](#-cấu-hình)
- [Cách sử dụng](#-cách-sử-dụng)
- [Lệnh](#-lệnh)
- [Khắc phục sự cố](#-khắc-phục-sự-cố)
- [Hỗ trợ](#-hỗ-trợ)
- [Giấy phép](#-giấy-phép)

---

## ✨ Chức Năng

### 🎵 Hệ Thống Nhạc
- **42 Lệnh** - 21 lệnh slash + 21 lệnh prefix
- **Âm thanh chất lượng cao** - Streaming bằng Lavalink v4
- **Hỗ trợ nhiều nguồn** - YouTube, Spotify, SoundCloud, Bandcamp
- **Bộ lọc nâng cao** - Hơn 12 hiệu ứng âm thanh (nightcore, bassboost, 8D, ...)
- **Quản lý hàng chờ** - Hàng chờ không giới hạn kèm phân trang
- **Hỗ trợ playlist** - Tải toàn bộ playlist chỉ với một lần

### 🎨 Giao Diện Hiện Đại
- **Nút tua nhạc trực tiếp** - Tua nhạc từ thanh tiến trình (⏪ ◀️ 🔄 ▶️ ⏩)
- **Nút điều khiển tương tác** - Điều khiển nhạc bằng nút bấm
- **Menu thả xuống** - Chọn bài hát, danh mục trợ giúp
- **Tự động cập nhật** - Embed “Đang phát” tự động làm mới
- **Thanh tiến trình** - Hiển thị trạng thái phát nhạc
- **Embed phong phú** - Embed Discord đẹp mắt
- **Hệ thống phản hồi** - Tích hợp feedback và báo lỗi

### 🛠️ Dành Cho Nhà Phát Triển
- **Kiến trúc sạch** - Cấu trúc code module hóa
- **Ghi log toàn diện** - Hệ thống logging Winston
- **Xử lý lỗi mạnh mẽ** - Cơ chế khôi phục khi lỗi
- **Triển khai dễ dàng** - Script tự động hóa
- **Tài liệu đầy đủ** - Hơn 25 file tài liệu chi tiết

---

### 🎉 Tính Năng Nổi Bật
- 📊 **Hệ Thống Chỉ Số Nâng Cao** - Theo dõi hiệu năng theo thời gian thực  
  - Lệnh `/metrics` (chỉ dành cho Admin)  
  - Theo dõi thời gian phản hồi lệnh  
  - Thống kê phát nhạc (bài hát, playlist, thời lượng)  
  - Giám sát tỉ lệ cache hit  
  - Theo dõi và phân loại lỗi  
  - Giám sát tài nguyên hệ thống (RAM, CPU)  
  - Ghi log chỉ số tự động mỗi giờ  

- 🏷️ **Quản Lý Phiên Bản Tập Trung** - Một nguồn duy nhất  
  - Phiên bản quản lý trong `Core/utils/version.js`  
  - Tự động chèn phiên bản vào config  
  - Theo dõi số build và codename  
  - Phát hiện môi trường chạy  
  - Hỗ trợ cờ chức năng (feature flags)  

- 📜 **Hệ Thống Phát Lại Lịch Sử** - Nghe lại bài hát gần đây  
  - Nút Replay trên giao diện điều khiển “Đang phát”  
  - Dropdown hiển thị 10 bài gần nhất  
  - Thông tin chi tiết: thời lượng, nghệ sĩ, thời gian phát  
  - Caching thông minh kèm auto-cleanup  

---

## 🚀 Bắt Đầu Nhanh

### ⭐ Tùy Chọn 1: Unified Launcher (MỚI & KHUYẾN NGHỊ!)

**Cách đơn giản nhất để khởi động Miyao Bot - chỉ cần một file!**

```batch
# Bước 1: Build launcher (chỉ một lần)
.uild-launcher.bat

# Bước 2: Khởi động bot
.\MiyaoLauncher.exe

# Hoặc dùng quick-start helper
.\START.bat
```

**Tính năng:**  
- ✅ Kiểm tra tự động mọi điều kiện cần thiết (Node.js, Java, file)  
- ✅ Xác minh cấu hình .env  
- ✅ Tự cài dependency nếu thiếu  
- ✅ Khởi động Lavalink với bộ nhớ tối ưu  
- ✅ Triển khai lệnh slash vào Discord  
- ✅ Khởi động bot Discord  
- ✅ Giám sát mọi thứ và hiển thị log theo thời gian thực  

📖 Xem thêm [LAUNCHER_README.md](LAUNCHER_README.md) để biết chi tiết.

---

### Tùy Chọn 2: Cách Truyền Thống (Thủ Công)

**Windows:**
```batch
# Terminal 1 - Start Lavalink
.\start-lavalink.bat

# Terminal 2 - Deploy commands (chỉ 1 lần đầu)
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

### Tùy Chọn 3: Electron GUI Launcher (Cũ)

```bash
# Sau khi cài đặt
cd launcher
npm start
# Nhấn "Start Bot" trong giao diện
```

**Lưu ý:** Electron launcher sẽ sớm ngừng hỗ trợ, thay bằng Unified launcher.

---

## 💻 Yêu Cầu Hệ Thống

### Tối Thiểu
- **OS**: Windows 10, macOS 10.13, Ubuntu 18.04  
- **Node.js**: 18.0.0 trở lên  
- **Java**: 11 trở lên (cho Lavalink)  
- **RAM**: 2 GB  
- **Dung lượng**: 500 MB  

### Khuyến Nghị
- **OS**: Windows 11, macOS 12+, Ubuntu 22.04  
- **Node.js**: 20.0.0 trở lên  
- **Java**: 17 trở lên  
- **RAM**: 4 GB  
- **Dung lượng**: 1 GB  

---

## 📦 Cài Đặt

### Bước 1: Điều Kiện Cần Thiết
Cài Node.js 18+ từ [nodejs.org](https://nodejs.org/)  
Cài Java 11+ từ [adoptium.net](https://adoptium.net/)

### Bước 2: Cài Dependency
```bash
npm install
cd launcher
npm install
cd ..
```

### Bước 3: Cấu Hình
1. **Tạo file .env**
```bash
copy .env.example .env  # Windows
cp .env.example .env    # Linux/Mac
```

2. **Chỉnh file .env với thông tin Discord**
```env
DISCORD_TOKEN=token_bot_của_bạn
CLIENT_ID=client_id_của_bạn
GUILD_ID=guild_id_của_bạn  # Tùy chọn để test
LAVALINK_PASSWORD=youshallnotpass
```

3. **Cấu hình bot tùy chỉnh (tùy chọn):**  
Chỉnh `config/config.json`.

### Bước 4: Deploy Lệnh
```bash
npm run deploy
```

### Bước 5: Khởi Động Bot

**Cách A - Desktop Launcher:**
```bash
cd launcher
npm start
```

**Cách B - Thủ Công:**
```bash
java -jar Lavalink.jar   # Terminal 1
npm start                # Terminal 2
```

**Cách C - Batch Script (Windows):**
```batch
start-lavalink.bat
start-bot.bat
```

---

## ⚙️ Cấu Hình

### Biến Môi Trường (.env)
```env
DISCORD_TOKEN=token_bot
CLIENT_ID=client_id
GUILD_ID=guild_id  # tùy chọn
LAVALINK_PASSWORD=youshallnotpass
NODE_ENV=production
```

### Cấu Hình Bot (config/config.json)
```json
{
  "bot": {
    "name": "Miyao",
    "prefix": "!",
    "color": "#5865F2",
    "activity": "🎵 /help để xem lệnh"
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

## 🎮 Cách Sử Dụng

### Slash Commands
```
/play <bài hát>
/pause
/resume
/skip
/stop
/queue
/nowplaying
/volume <0-100>
/loop <chế độ>
/help
```

### Prefix Commands
```
!play <bài hát>
!pause
!resume
!skip
!stop
!queue
!np
!volume <0-100>
!loop <chế độ>
!help
```

---

## 📚 Lệnh

### Phát Nhạc
- `/play <từ khóa>` - Phát nhạc từ YouTube, Spotify, SoundCloud  
- `/pause` - Tạm dừng  
- `/resume` - Tiếp tục  
- `/skip` - Bỏ qua  
- `/stop` - Dừng và xóa hàng chờ  

### Quản Lý Hàng Chờ
- `/queue` - Hiển thị hàng chờ  
- `/shuffle` - Trộn danh sách  
- `/clear` - Xóa toàn bộ hàng chờ  
- `/remove <vị trí>` - Xóa bài cụ thể  
- `/move <từ> <đến>` - Di chuyển bài  
- `/jump <vị trí>` - Nhảy tới bài hát cụ thể  

### Điều Khiển Âm Thanh
- `/volume <0-100>` - Chỉnh âm lượng  
- `/loop <off|track|queue>` - Lặp lại  
- `/seek <time>` - Tua đến thời gian  
- `/filter <loại>` - Thêm hiệu ứng  

### Thông Tin
- `/nowplaying` - Hiển thị bài hát hiện tại  
- `/help` - Trợ giúp  
- `/ping` - Kiểm tra ping  
- `/stats` - Thống kê hiệu năng bot  
- `/nodes` - Thông tin node Lavalink  
- `/history` - Lịch sử bài hát  

---

## 📖 Tài Liệu

### Hướng Dẫn Người Dùng
- [SETUP.md](docs/SETUP.md) - Hướng dẫn cài đặt  
- [FAQ.md](docs/FAQ.md) - Câu hỏi thường gặp  
- [RELEASE_NOTES.md](docs/RELEASE_NOTES.md) - Có gì mới trong v1.2.0  
- [CHANGELOG.md](docs/CHANGELOG.md) - Lịch sử thay đổi  

### Tài Liệu Kỹ Thuật
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Kiến trúc hệ thống  
- [launcher/USER_GUIDE.md](launcher/USER_GUIDE.md) - Hướng dẫn launcher  
- [launcher/BUILD_GUIDE.md](launcher/BUILD_GUIDE.md) - Build launcher  

### Tham Khảo Nhanh
- [RELEASE_GUIDE_VI.md](docs/RELEASE_GUIDE_VI.md) - Hướng dẫn phát hành (Tiếng Việt)

---

## 🔧 Khắc Phục Sự Cố

### Bot không chạy
- Kiểm tra Node.js >= 18  
- Kiểm tra Java >= 11  
- Kiểm tra token trong .env  
- Lavalink đã chạy?  

### Lệnh không hoạt động
- Nguyên nhân: chưa deploy commands  
- Giải pháp:  
```bash
npm run deploy
```

### Nhạc không phát
- Kiểm tra server Lavalink  
- Port 2333 có bị chặn không?  
- Mật khẩu trong .env có khớp với `application.yml` không?  

### Launcher không mở
- Chưa cài dependency cho launcher  
```bash
cd launcher
npm install
npm start
```

---

## 💬 Hỗ Trợ

- **Tài liệu**: thư mục `docs/`  
- **FAQ**: [FAQ.md](docs/FAQ.md)  
- **Issues**: [GitHub Issues](https://github.com/khuongit24/miyao-bot/issues)  

**Báo lỗi:** Dùng hệ thống feedback trong bot hoặc GitHub Issue kèm thông tin:  
- Phiên bản bot (1.3.0)  
- Log lỗi  
- Cách tái hiện lỗi  
- Kết quả mong đợi vs thực tế  

---

## 🤝 Đóng Góp

Chào mừng mọi đóng góp! Xem hướng dẫn trong CONTRIBUTING.md.

### Thiết Lập Dev
```bash
git clone https://github.com/khuongit24/miyao-bot.git
cd miyao-bot
npm install
cp .env.example .env
npm run dev
```

---

## 📄 Giấy Phép

Dự án này theo giấy phép MIT - xem [LICENSE](LICENSE).

---

## 🙏 Ghi Nhận

### Công Nghệ
- Discord.js v14  
- Shoukaku v4  
- Lavalink v4  
- Electron v28  
- Winston v3  

### Cảm Ơn Đặc Biệt
- Cộng đồng Discord.js  
- Nhóm phát triển Shoukaku  
- Đội ngũ Lavalink  
- Tất cả contributors và tester  

---

## 📊 Thống Kê

- Phiên bản: 1.3.0  
- Ngày phát hành: 03/10/2025  
- Số lệnh: 42  
- Dòng code: ~15,000  
- Tài liệu: 25+ file  
- Hỗ trợ: đang phát triển  

---

<div align="center">


[⭐ Star trên GitHub](https://github.com/khuongit24) • [🐛 Báo lỗi](https://github.com/khuongit24/issues) • [💡 Đề xuất tính năng](https://github.com/khuongit24/issues)

</div>
