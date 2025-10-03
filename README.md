# 🎵 Miyao Bot Master Setup

**Complete Installation Wizard for Miyao Discord Music Bot**

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)

---

## ✨ Features

### 🔍 Smart Detection
- **Auto-check** Node.js và Java installation
- **Version validation** (Node.js 18+, Java 17+)
- **Direct download links** nếu thiếu dependencies

### 📦 Complete Installation
- **Copy bot files** to chosen directory
- **Install npm packages** automatically
- **Create .env** configuration file
- **Desktop shortcuts** for easy access

### 🚀 Launcher Integration
- **Optional launcher** installation wizard
- **One-click launch** of launcher setup
- **Seamless integration** with Miyao Bot Launcher v2.0

---

## 🎯 What Gets Installed

1. **Miyao Bot** - Discord music bot core files
2. **Lavalink Server** - Music streaming engine (Lavalink.jar)
3. **Dependencies** - All npm packages (discord.js, shoukaku, etc.)
4. **Configuration** - .env file template
5. **Shortcuts** - Desktop shortcut to start bot
6. **Launcher** (Optional) - Modern UI for bot management

---

## 🚀 Usage

### For End Users:

1. **Run MiyaoBotSetup.exe**
2. Follow the installation wizard:
   - Check system requirements
   - Choose installation directory
   - Wait for installation to complete
   - (Optional) Install launcher

3. **Configure bot:**
   - Open `.env` file in install directory
   - Add your Discord Bot Token
   - Add your Client ID

4. **Run bot:**
   - Use desktop shortcut, OR
   - Use Launcher (if installed)

---

## 🛠️ For Developers

### Prerequisites:
- Node.js 18+
- npm or yarn

### Building the Setup:

```bash
cd master-setup

# Install dependencies
npm install

# Test in development
npm start

# Build for Windows
npm run build

# Output: dist/MiyaoBotSetup-1.0.0.exe
```

---

## 📁 Project Structure

```
master-setup/
├── src/
│   ├── main.js          # Electron main process
│   ├── renderer.js      # Frontend logic
│   ├── index.html       # Setup wizard UI
│   └── styles.css       # Styling
├── assets/
│   └── icons/           # Setup icons
├── package.json         # Dependencies & build config
└── README.md            # This file
```

---

## 🎨 Customization

### Change Colors:
Edit `src/styles.css`:
```css
:root {
    --primary: #8b5cf6;
    --secondary: #ec4899;
    /* ... */
}
```

### Change Icons:
Place your icons in `assets/icons/`:
- `setup.ico` - Windows icon
- `setup.png` - App icon

---

## 🔧 How It Works

### 1. Requirements Check
- Detects installed Node.js version
- Detects installed Java version
- Shows download links if missing

### 2. Installation
- Copies bot files from embedded resources
- Runs `npm install` to get dependencies
- Creates .env from template
- Creates desktop shortcuts

### 3. Launcher Option
- Prompts user to install launcher
- If yes: launches launcher setup from `../launcher-v2/dist`
- If no: user can install manually later

---

## 📊 Technical Details

### Built With:
- **Electron 28.0.0** - Desktop framework
- **electron-builder** - Packaging tool
- **Node.js child_process** - For running npm install

### Build Configuration:
- **Target:** Windows x64 NSIS installer
- **One-click:** No (allows directory selection)
- **Shortcuts:** Desktop + Start Menu
- **Embedded Resources:** Bot files + Launcher setup

---

## ⚙️ Configuration

### package.json Build Settings:

```json
"build": {
  "extraResources": [
    {
      "from": "../",
      "to": "bot-files",
      "filter": ["**/*", "!node_modules", ...]
    },
    {
      "from": "../launcher-v2/dist",
      "to": "launcher-setup"
    }
  ]
}
```

This embeds:
- All bot files (except node_modules)
- Launcher setup executable

---

## 🐛 Troubleshooting

### Setup won't run
- Check Windows SmartScreen
- Run as Administrator

### Node.js/Java not detected
- Restart terminal after installing
- Add to PATH environment variable
- Restart setup

### npm install fails
- Check internet connection
- Try manual install: `npm install` in bot directory
- Check npm cache: `npm cache clean --force`

### Launcher setup not found
- Ensure launcher is built first: `cd ../launcher-v2 && npm run build`
- Check `launcher-v2/dist/` for setup executable

---

## 📝 TODO

- [ ] Add Linux/macOS support
- [ ] Add rollback on installation failure
- [ ] Add update checker
- [ ] Add uninstaller
- [ ] Add installation size calculator
- [ ] Add custom theme support

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

---

## 📜 License

MIT License - see LICENSE.txt for details

---

## 💖 Credits

**Developed by Miyao Team**

Special thanks to:
- Electron.js team
- electron-builder team
- All contributors

---

## 📞 Support

- 📧 **Email:** support@miyao.bot
- 💬 **Discord:** [Join our server](#)
- 🐛 **Issues:** [GitHub Issues](#)

---

**Miyao Bot Master Setup v1.0.0** - Complete bot installation made easy! 🎵✨
