# Headless Client

A local web dashboard for controlling Minecraft bots with [mineflayer](https://github.com/PrismarineJS/mineflayer).

The app starts a bot control server on your computer, then lets you add accounts, connect to a Minecraft server, send chat, move, use hotbar slots, view inventory, and run simple macros from the browser.

## Features

- Local browser dashboard at `http://127.0.0.1:3000`
- Supports multiple bot accounts in one session
- Microsoft and offline auth options
- Start, stop, delete, and reconnect bots
- Send chat messages and commands
- Movement controls for walking, jumping, sprinting, sneaking, swinging, and using items
- Hotbar and inventory controls
- Simple macro runner for repeated actions
- Optional anti-kick behavior in the code configuration

## Requirements

- Windows, macOS, or Linux
- [Node.js](https://nodejs.org/) 18 or newer
- A Minecraft Java account if you use `microsoft` auth
- Access to the Minecraft server you want the bot to join

## Setup

Clone the repository:

```powershell
git clone https://github.com/Thyxo/headless-client.git
cd headless-client
```

Install dependencies:

```powershell
npm install
```

Start the control panel:

```powershell
npm start
```

Then open:

```text
http://127.0.0.1:3000
```

On Windows, you can also double-click:

```text
start-control.bat
```

That script starts the app and opens the control panel in your browser.

## Configuration

The app has built-in defaults, but you can override the most important settings with environment variables.

| Variable | Default | Description |
| --- | --- | --- |
| `WEB_PORT` | `3000` | Local web dashboard port |
| `MC_HOST` | `play.example.com` | Minecraft server host |
| `MC_PORT` | `25565` | Minecraft server port |
| `MC_USERNAME` | `player@example.com` | Minecraft login username or email |
| `MC_AUTH` | `microsoft` | Auth mode, usually `microsoft` or `offline` |
| `MC_AVATAR` | `MHF_Steve` | Avatar name or UUID shown in the dashboard |

PowerShell example:

```powershell
$env:MC_HOST="play.example.com"
$env:MC_PORT="25565"
$env:MC_USERNAME="your-email@example.com"
$env:MC_AUTH="microsoft"
npm start
```

Command Prompt example:

```bat
set MC_HOST=play.example.com
set MC_PORT=25565
set MC_USERNAME=your-email@example.com
set MC_AUTH=microsoft
npm start
```

You can also add or change account details directly from the web dashboard.

## Using The Dashboard

1. Start the app with `npm start` or `start-control.bat`.
2. Open `http://127.0.0.1:3000`.
3. Click **Add Account** if you want another bot profile.
4. Set the server host, port, username, avatar, and auth mode.
5. Click **Start** to connect the selected bot.
6. Use the movement, chat, hotbar, inventory, and macro controls from the page.

The dashboard only runs locally on `127.0.0.1`, so it is meant for use on your own machine.

## Macro Commands

Macros are written one command per line.

Example:

```text
forward 1000
wait 300
jump 300
hotbar 1
swing
chat /spawn
```

Available commands:

| Command | Example | What it does |
| --- | --- | --- |
| `forward ms` | `forward 1000` | Move forward for the given milliseconds |
| `back ms` | `back 500` | Move backward |
| `left ms` | `left 500` | Move left |
| `right ms` | `right 500` | Move right |
| `jump ms` | `jump 300` | Jump |
| `sneak ms` | `sneak 700` | Sneak |
| `sprint ms` | `sprint 1200` | Sprint |
| `wait ms` | `wait 300` | Pause the macro |
| `hotbar 1-9` | `hotbar 1` | Select a hotbar slot |
| `swing` | `swing` | Swing the bot's arm |
| `use` | `use` | Start using the held item |
| `deactivate` | `deactivate` | Stop using the held item |
| `drop` | `drop` | Drop the selected item |
| `click slot` | `click 36` | Click an inventory slot |
| `chat text` | `chat /spawn` | Send chat or a command |

## Troubleshooting

### `npm install` fails

Make sure Node.js is installed:

```powershell
node -v
npm -v
```

If those commands fail, install Node.js and reopen your terminal.

### The browser cannot open the dashboard

Make sure the app is still running. The terminal should show:

```text
Bot control is running at http://127.0.0.1:3000
```

If port `3000` is already in use, choose another port:

```powershell
$env:WEB_PORT="3001"
npm start
```

Then open `http://127.0.0.1:3001`.

### Microsoft login does not work

Check that `MC_AUTH` is set to `microsoft` and that the username is the email for your Minecraft Java account.

Some servers or account setups may require a browser login flow from mineflayer. Watch the terminal output for login instructions.

### The bot connects and instantly disconnects

Common causes:

- Wrong Minecraft server version
- Server does not allow bots
- Server requires extra authentication
- Account is not allowed on the server
- The bot was kicked by anti-bot protection

The current bot version in code is `1.8.9`, so connect to servers that support that version.

## Development

Run the app:

```powershell
npm start
```

There is no test suite yet. The current `npm test` script is only a placeholder.

## License

ISC
