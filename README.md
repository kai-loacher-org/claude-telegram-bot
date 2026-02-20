# Claude Telegram Bot 🤖

A Telegram bot that provides mobile access to [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) with voice message support and persistent sessions.

## Features

- 💬 **Text Messages** - Send text messages directly to Claude Code
- 🎤 **Voice Messages** - Record voice notes, automatically transcribed with Whisper
- ✨ **Smart Transcription** - Removes stutters, filler words ("ähm", "also", etc.)
- 🔄 **Session Persistence** - Continues conversation across messages
- 🔒 **User Allowlist** - Restrict bot access to specific Telegram users
- 📱 **Mobile-First** - Full Claude Code access from your phone

## Architecture

```
┌────────────────┐     ┌─────────────────┐     ┌──────────────┐
│    Telegram    │────▶│   Bot Server    │────▶│  Claude Code │
│  (Text/Voice)  │◀────│   (Node.js)     │◀────│     CLI      │
└────────────────┘     └─────────────────┘     └──────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │  Whisper API    │
                       │ (Transcription) │
                       └─────────────────┘
```

## Prerequisites

- Node.js 18+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and configured
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- OpenAI API Key (for Whisper)
- Anthropic API Key (for Claude Code)

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/kai-loacher-org/claude-telegram-bot.git
cd claude-telegram-bot
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create a Telegram Bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram
2. Send `/newbot` and follow instructions
3. Copy the bot token

### 4. Get your Telegram User ID

1. Open [@userinfobot](https://t.me/userinfobot) in Telegram
2. Send any message
3. Copy your user ID

### 5. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
ALLOWED_USERS=your_user_id
WORKING_DIRECTORY=/path/to/your/project
```

### 6. Start the bot

```bash
npm start
```

Or for development with auto-restart:

```bash
npm run dev
```

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and session info |
| `/status` | Show current session and config |
| `/reset` | Start a new session |

### Text Messages

Simply send a text message to Claude Code:

```
Explain this project structure
```

### Voice Messages

Hold the microphone button and speak. The bot will:

1. Download the voice message
2. Transcribe with Whisper
3. Refine (remove stutters/filler words)
4. Send to Claude Code
5. Return the response

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | Required |
| `OPENAI_API_KEY` | OpenAI API key for Whisper | Required |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude | Required |
| `ALLOWED_USERS` | Comma-separated Telegram user IDs | All users |
| `WORKING_DIRECTORY` | Directory for Claude Code to work in | Current dir |
| `CLAUDE_MODEL` | Claude model (sonnet/opus/haiku) | sonnet |
| `SESSION_PREFIX` | Prefix for session names | telegram |
| `REFINE_TRANSCRIPTS` | Clean up voice transcriptions | true |

## Session Management

Each Telegram user gets their own Claude Code session named `telegram-{user_id}`.

Sessions persist across messages, so you can have ongoing conversations:

```
You: Explain the auth module
Claude: [explains auth module]

You: Now add error handling to it
Claude: [modifies auth module with context from previous message]
```

Use `/reset` to start a fresh session.

## Running as a Service

### Using systemd (Linux)

Create `/etc/systemd/system/claude-telegram-bot.service`:

```ini
[Unit]
Description=Claude Telegram Bot
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/claude-telegram-bot
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable claude-telegram-bot
sudo systemctl start claude-telegram-bot
```

### Using PM2

```bash
npm install -g pm2
pm2 start src/index.js --name claude-telegram-bot
pm2 save
pm2 startup
```

## Security Considerations

- **Always set `ALLOWED_USERS`** to restrict access
- Keep your API keys secure
- The bot has full Claude Code access - be careful what you allow
- Consider running in a sandboxed environment

## Troubleshooting

### "Claude Code failed"

1. Make sure `claude` CLI is installed and in PATH
2. Verify `ANTHROPIC_API_KEY` is correct
3. Check working directory exists and is accessible

### Voice messages not working

1. Verify `OPENAI_API_KEY` is correct
2. Check bot has permission to receive voice messages

### Bot not responding

1. Check bot is running (`npm start`)
2. Verify `TELEGRAM_BOT_TOKEN` is correct
3. Make sure your user ID is in `ALLOWED_USERS`

## License

MIT

## Credits

Built for the Ninja Project by Max & Kai Loacher.
