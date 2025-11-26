#!/bin/bash

# ========================================
# Miyao Music Bot v1.2.0 - Unix Installer
# Supports: Linux, macOS, WSL
# ========================================

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "========================================"
echo "Miyao Music Bot v1.2.0"
echo "Unix Installation Script"
echo "========================================"
echo ""

# Check if running from correct directory
if [ ! -f "index.js" ]; then
    echo -e "${RED}[X] ERROR: Please run this script from the bot root directory!${NC}"
    echo "Current directory: $(pwd)"
    exit 1
fi

echo "[1/6] Checking System Requirements..."
echo "----------------------------------------"

# Check Node.js
echo "Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo ""
    echo -e "${RED}[X] ERROR: Node.js not found!${NC}"
    echo ""
    echo "Please install Node.js 18 or higher:"
    echo "  Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs"
    echo "  macOS: brew install node"
    echo "  Or download from: https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node --version)
echo -e "${GREEN}[+]${NC} Node.js $NODE_VERSION detected"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}[X] ERROR: npm not found!${NC}"
    echo "npm should be installed with Node.js"
    exit 1
fi

# Check Java
echo "Checking Java..."
if ! command -v java &> /dev/null; then
    echo ""
    echo -e "${YELLOW}[!] WARNING: Java not found!${NC}"
    echo ""
    echo "Music playback requires Java 11 or higher."
    echo "Install instructions:"
    echo "  Ubuntu/Debian: sudo apt-get install openjdk-17-jre"
    echo "  macOS: brew install openjdk@17"
    echo "  Or download from: https://adoptium.net/"
    echo ""
    read -p "Continue installation without Java? (y/N): " CONTINUE
    if [[ ! "$CONTINUE" =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        exit 1
    fi
else
    JAVA_VERSION=$(java -version 2>&1 | head -n 1 | cut -d'"' -f2)
    echo -e "${GREEN}[+]${NC} Java $JAVA_VERSION detected"
fi

# Check Lavalink.jar
echo "Checking Lavalink.jar..."
if [ ! -f "Lavalink.jar" ]; then
    echo ""
    echo -e "${YELLOW}[!] WARNING: Lavalink.jar not found!${NC}"
    echo "Music playback requires Lavalink audio server."
    echo ""
    echo "Download from: https://github.com/lavalink-devs/Lavalink/releases"
    echo "Place Lavalink.jar in the bot root directory."
    echo ""
    read -p "Continue installation without Lavalink? (y/N): " CONTINUE
    if [[ ! "$CONTINUE" =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        exit 1
    fi
else
    echo -e "${GREEN}[+]${NC} Lavalink.jar found"
fi

echo ""
echo "[2/6] Installing Bot Dependencies..."
echo "----------------------------------------"
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}[+]${NC} Bot dependencies installed successfully"
else
    echo ""
    echo -e "${RED}[X] ERROR: Failed to install bot dependencies!${NC}"
    echo ""
    echo "Common causes:"
    echo "- No internet connection"
    echo "- npm registry issues"
    echo "- Permission problems"
    echo ""
    echo "Try running with sudo or check your network."
    exit 1
fi

echo ""
echo "[3/6] Installing Launcher Dependencies..."
echo "----------------------------------------"
if [ -d "launcher" ]; then
    cd launcher
    npm install
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[+]${NC} Launcher dependencies installed successfully"
    else
        echo ""
        echo -e "${YELLOW}[!] WARNING: Failed to install launcher dependencies!${NC}"
        echo "Launcher may not work properly."
        echo ""
        read -p "Continue? (y/N): " CONTINUE
        if [[ ! "$CONTINUE" =~ ^[Yy]$ ]]; then
            cd ..
            echo "Installation cancelled."
            exit 1
        fi
    fi
    cd ..
else
    echo -e "${YELLOW}[!] WARNING: Launcher directory not found${NC}"
    echo "Desktop launcher will not be available."
fi

echo ""
echo "[4/6] Setting Up Configuration Files..."
echo "----------------------------------------"

# Setup .env
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp ".env.example" ".env"
        echo -e "${GREEN}[+]${NC} Created .env file from template"
        echo ""
        echo -e "${YELLOW}[!] IMPORTANT: You MUST edit .env file with your Discord token!${NC}"
        echo ""
    else
        echo -e "${YELLOW}[!] WARNING: .env.example not found!${NC}"
        echo "You'll need to create .env manually."
    fi
else
    echo -e "${GREEN}[+]${NC} .env file already exists (not overwritten)"
fi

# Setup config.json
if [ ! -f "config/config.json" ]; then
    if [ -f "config/config.example.json" ]; then
        cp "config/config.example.json" "config/config.json"
        echo -e "${GREEN}[+]${NC} Created config.json from template"
    else
        echo -e "${YELLOW}[!] WARNING: config.example.json not found!${NC}"
    fi
else
    echo -e "${GREEN}[+]${NC} config.json already exists (not overwritten)"
fi

echo ""
echo "[5/6] Creating Start Scripts..."
echo "----------------------------------------"

# Create quick-start.sh
cat > quick-start.sh << 'EOF'
#!/bin/bash
echo "Starting Miyao Music Bot..."
cd "$(dirname "$0")"
npm start
EOF
chmod +x quick-start.sh
echo -e "${GREEN}[+]${NC} Created quick-start.sh"

# Create start-with-lavalink.sh
cat > start-with-lavalink.sh << 'EOF'
#!/bin/bash
echo "Starting Miyao Music Bot with Lavalink..."
cd "$(dirname "$0")"

# Check if Lavalink.jar exists
if [ ! -f "Lavalink.jar" ]; then
    echo "ERROR: Lavalink.jar not found!"
    exit 1
fi

# Start Lavalink in background
echo "Starting Lavalink server..."
java -jar Lavalink.jar > logs/lavalink.log 2>&1 &
LAVALINK_PID=$!
echo "Lavalink started with PID: $LAVALINK_PID"

# Wait for Lavalink to start
echo "Waiting for Lavalink to initialize..."
sleep 5

# Start bot
echo "Starting bot..."
npm start

# Cleanup: Kill Lavalink when bot stops
kill $LAVALINK_PID 2>/dev/null
echo "Lavalink stopped."
EOF
chmod +x start-with-lavalink.sh
echo -e "${GREEN}[+]${NC} Created start-with-lavalink.sh"

echo ""
echo "[6/6] Running Setup Verification..."
echo "----------------------------------------"
if [ -f "verify-bot-setup.js" ]; then
    node verify-bot-setup.js || true
else
    echo -e "${YELLOW}[!] WARNING: verify-bot-setup.js not found${NC}"
    echo "Skipping verification."
fi

echo ""
echo "========================================"
echo "Installation Complete!"
echo "========================================"
echo ""
echo "Next Steps:"
echo "----------------------------------------"
echo ""
echo "1. Edit Configuration:"
echo "   - Open .env in a text editor"
echo "   - Add your Discord bot token"
echo "   - Add your bot's Client ID"
echo "   - (Optional) Add your Guild ID for testing"
echo ""
echo "   Command: nano .env  (or your favorite editor)"
echo ""
echo "2. Deploy Slash Commands:"
echo "   npm run deploy"
echo ""
echo "3. Start the Bot:"
echo ""
echo "   Option A - Use Desktop Launcher:"
echo "     cd launcher"
echo "     npm start"
echo ""
echo "   Option B - Manual Start:"
echo "     ./start-bot.sh"
echo "     OR: ./start-with-lavalink.sh"
echo ""
echo "   Option C - Quick Start:"
echo "     ./quick-start.sh"
echo ""
echo "4. Need Help?"
echo "   - Read: QUICKSTART.md"
echo "   - Read: README.md"
echo "   - Check: FAQ.md"
echo ""
echo "========================================"
echo ""

# Ask to open .env file
read -p "Open .env file now for editing? (y/N): " OPEN_ENV
if [[ "$OPEN_ENV" =~ ^[Yy]$ ]]; then
    if [ -f ".env" ]; then
        # Try different editors
        if command -v nano &> /dev/null; then
            nano .env
        elif command -v vim &> /dev/null; then
            vim .env
        elif command -v vi &> /dev/null; then
            vi .env
        elif command -v code &> /dev/null; then
            code .env
        else
            echo "No text editor found. Please edit .env manually."
        fi
    fi
fi

echo ""
echo "Installation script finished. Have fun with Miyao Bot! 🎵"
