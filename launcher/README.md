# Miyao Launcher

🎵 Ứng dụng launcher để quản lý Lavalink server và Miyao Discord Bot.

## Tính năng

### 🎛️ Quản lý Lavalink
- Khởi động/Dừng Lavalink server
- Xem output terminal real-time
- Theo dõi trạng thái server

### 🤖 Quản lý Bot
- Khởi động/Dừng Discord Bot
- Deploy slash commands lên Discord
- Xem logs và output real-time

### ⚙️ Cài đặt
- Chỉnh sửa file `.env` trực tiếp trên launcher
- Thay đổi đường dẫn thư mục bot
- Tự động lưu cấu hình

### ℹ️ Thông tin
- Hiển thị phiên bản launcher
- Hiển thị thông tin bot (version, build, codename)

## Yêu cầu hệ thống

- **Node.js**: ≥ 20.0.0
- **Java**: ≥ 17 (cho Lavalink)
- **npm**: Đi kèm với Node.js
- **Miyao Bot**: Phiên bản ≥ 1.4.0

## Cài đặt

```bash
# Di chuyển vào thư mục launcher
cd launcher

# Cài đặt dependencies
npm install

# Chạy launcher
npm start

# Chạy ở chế độ dev (có DevTools)
npm run dev
```

## Build ứng dụng

```bash
# Build cho Windows
npm run build:win

# Build cho macOS
npm run build:mac

# Build cho Linux
npm run build:linux
```

## Cấu trúc thư mục

```
launcher/
├── src/
│   ├── main/           # Main process (Electron)
│   │   ├── main.js     # Entry point
│   │   └── preload.js  # Preload script
│   └── renderer/       # Renderer process (UI)
│       ├── index.html  # Main HTML
│       ├── renderer.js # UI logic
│       └── styles/     # CSS styles
├── assets/             # Icons và assets
└── package.json
```

## Sử dụng lần đầu

1. Khởi động launcher
2. Kiểm tra yêu cầu hệ thống (Node.js, Java, npm)
3. Chọn thư mục chứa Miyao Bot
4. Cấu hình file `.env` nếu cần
5. Khởi động Lavalink trước
6. Khởi động Bot

## Quy trình khởi động đề xuất

1. **Khởi động Lavalink** - Đợi cho đến khi thấy "Lavalink is ready"
2. **Khởi động Bot** - Bot sẽ tự động kết nối với Lavalink
3. **Deploy Commands** (lần đầu hoặc khi cập nhật) - Đăng ký slash commands

## Lưu ý

- Luôn khởi động Lavalink trước khi chạy Bot để đảm bảo bot có thể phát nhạc
- Dừng Bot và Lavalink trước khi đóng launcher
- Sau khi chỉnh sửa `.env`, cần khởi động lại Bot để áp dụng thay đổi

## License

MIT License - Miyao Team
