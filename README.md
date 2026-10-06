# vWire

Send a file from one device to another, straight from the browser, using a QR code.
Nothing to install, and **the file never touches the server**: it travels directly between the two
devices (WebRTC). The server only introduces the two devices to each other.

Works between phone and phone, computer and phone, and computer and computer.

## How it works

1. On the first device choose **Send a file** (and pick the file) or **Receive a file**. A QR code appears.
2. The other device scans the QR code with its camera. If the first device sends, the transfer starts;
   if it receives, the second device taps **Upload file** and picks the file.
3. A progress bar shows speed and time left. Either device can stop the transfer at any time. The screen is kept on during a session, where the browser allows it.

**No camera? Connect without QR.** Under the QR code, tap *Connect without QR* to get a 6-digit code
(`123 - 456`). On the other device tap *I have a code* on the home page and type it. An emoji then shows
up on the first device, and three emojis (from different categories) show up on the second one.
The two people confirm by voice ("the tiger") and the second device taps the matching emoji.
This works for any pair of devices, including two computers.

The QR code and the code expire after **60 seconds** if nobody connects. Once two devices are connected
there is no time limit.

## Privacy and security

- Files go device to device over an encrypted WebRTC data channel. They are not uploaded to, stored on, or
  relayed through the server (unless you configure a TURN server, see below).
- The server only relays the connection handshake and keeps sessions in memory for a short time.
  Nothing is written to disk.
- The session id in the QR code lives in the URL fragment (`/#id`), which browsers never send to the server.
- Codes are random and single use. The server limits wrong codes to **3 per minute per client** and checks
  the emoji itself: it never sends the right answer to the second device, and a wrong choice closes the session.
- The encryption keys are agreed through the server, so you must trust the server you use. Host your own
  if that matters to you.
- The default STUN server (Google) only helps devices discover their public address and never sees the files.
  See `ICE_SERVERS` to change it.

## Requirements

- Node.js **20 or newer** (`node -v`). Debian 12 ships Node 18: install a newer one from
  [NodeSource](https://github.com/nodesource/distributions) or [nvm](https://github.com/nvm-sh/nvm).
  Debian 13 and Arch Linux are fine.
- A recent browser with WebRTC on both devices (Chrome, Firefox, Safari, Edge).
- HTTPS if the service is reachable from the internet. A reverse proxy such as nginx or Caddy takes care of it.

## Quick start

```bash
git clone https://github.com/aith69/vWire.git
cd vWire
npm ci --omit=dev
npm start
```

Open `http://localhost:3000`. To use it from your phone on the same network, open `http://<computer-ip>:3000`.
The compiled CSS, the QR library and the font are included in the repository, so no build step is needed.

## Install as a service (Debian / Arch)

The installer does everything in one go: it checks Node.js, creates an unprivileged system user, installs the
dependencies, writes `config.json` from your answers, creates the systemd unit and starts the service.
It asks a few questions; press Enter to keep the default shown in brackets.

~~bash
sudo git clone https://github.com/aith69/vWire.git /opt/vwire
cd /opt/vwire
sudo ./deploy/install.sh
~~

The folder must not be under `/home` or `/root` (the service is sandboxed and cannot read them). The service
name is the folder name in lowercase (`vwire` here); use `--service` to choose another one.

Without questions (for scripts, or when you already know the values):

~~bash
sudo ./deploy/install.sh --yes --set port=8080 --set trustProxy=true
~~

| Option | Meaning |
|---|---|
| `-y`, `--yes` | Do not ask anything: use the defaults and the `--set` values |
| `--set KEY=VALUE` | Set a configuration value (repeatable). Rewrites `config.json`, saving the old one as `config.json.bak-DATE` |
| `--service NAME` | systemd service name (default: folder name in lowercase) |
| `--user NAME` | System user that runs the service (default `vwire`, created if missing) |
| `--with-dev` | Also install the development dependencies, for a working copy |
| `--no-start` | Install the service without starting it |
| `--dry-run` | Show what would be done and change nothing |
| `--print-unit` | Print the systemd unit and exit |
| `--uninstall` | Stop and remove the service (folder, `config.json` and user are kept) |

Running the installer again is safe: it refreshes the dependencies and the unit and restarts the service, and it
keeps your `config.json` (unless you pass `--set`).

Update:

~~bash
cd /opt/vwire && sudo git pull && sudo ./deploy/install.sh --yes
~~

### Manual installation

~~bash
sudo useradd --system --no-create-home --user-group --shell /usr/sbin/nologin vwire   # Arch: /usr/bin/nologin
sudo git clone https://github.com/aith69/vWire.git /opt/vwire
cd /opt/vwire
sudo npm ci --omit=dev --ignore-scripts
sudo chmod -R go+rX /opt/vwire
sudo cp deploy/vwire.service /etc/systemd/system/vwire.service
# edit User, Group, WorkingDirectory and ExecStart in that file (node path: `command -v node`)
sudo systemctl daemon-reload
sudo systemctl enable --now vwire
curl http://localhost:3000/health
~~

Settings go in `config.json` (see Configuration below), not in the unit file. If it contains TURN credentials,
make it readable only by root and the service user: `sudo chown root:vwire config.json && sudo chmod 640 config.json`.

## Behind a reverse proxy

vWire needs the proxy to forward WebSockets on `/ws`. Ready-to-edit examples:

- nginx: [`deploy/nginx.conf.example`](deploy/nginx.conf.example)
- Caddy: [`deploy/Caddyfile.example`](deploy/Caddyfile.example)

Set `TRUST_PROXY=true` so that the server reads the client address from the `X-Real-IP` header; the examples
set it. Only do this when the server can be reached through the proxy alone (for example `HOST=127.0.0.1`),
otherwise anyone could fake the header and dodge the limit on wrong codes.

## Configuration

All settings live in one optional file, `config.json`, in the application folder.
Without it vWire uses the defaults.

~~bash
cp config.example.json config.json
nano config.json            # keep only the keys you want to change
sudo systemctl restart vwire
~~

Example, to change the name and the port:

~~json
{
  "name": "AirWire",
  "port": 8080
}
~~

`config.json` is ignored by git, so `git pull` never overwrites your settings.
JSON has no comments, so this table is the documentation (a key starting with `_` is ignored,
handy for your own notes).

| Key | Default | Meaning | Environment variable |
|---|---|---|---|
| `name` | `vWire` | Name shown as page title and heading, 1-30 characters. Not translated | `APP_NAME` |
| `port` | `3000` | Listening port | `PORT` |
| `host` | `0.0.0.0` | Listening address (`127.0.0.1` = this machine only) | `HOST` |
| `trustProxy` | `false` | Read the client address from `X-Real-IP` (behind a reverse proxy only) | `TRUST_PROXY` |
| `sessionTtlMs` | `60000` | How long a QR code or code stays valid while nobody has connected | `SESSION_TTL_MS` |
| `maxSessions` | `1000` | Maximum number of waiting sessions | `MAX_SESSIONS` |
| `maxTransferMb` | `512` | Largest transfer allowed, in MB (1-2048). Applies to what the sender selects and to what the receiver accepts | `MAX_TRANSFER_MB` |
| `codeAttempts` | `3` | Wrong codes allowed per client in the window below | `CODE_ATTEMPTS` |
| `codeAttemptWindowMs` | `60000` | Length of that window | `CODE_ATTEMPT_WINDOW_MS` |
| `iceServers` | Google STUN | List of STUN/TURN servers. `[]` = local network only | `ICE_SERVERS` (JSON) |

Values are read in this order, and the last one wins: built-in defaults, `config.json`, environment variables.
If a value is not valid, or a key is misspelled, vWire refuses to start and says what is wrong
(see `journalctl -u vwire`). Set `CONFIG_FILE` to use a file in another location.

Example with a TURN server (useful on strict networks, such as some mobile carriers; note that when a TURN
server is used the encrypted data goes through it):

~~json
{
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    { "urls": "turn:turn.example.org:3478", "username": "user", "credential": "secret" }
  ]
}
~~

If `config.json` contains TURN credentials, make it readable only by root and the service user:
`sudo chown root:vwire config.json && sudo chmod 640 config.json`.

Limits: the receiving device keeps the file in memory until the transfer ends, so files are limited to
**2 GiB** (**1 GiB** on iPhone and iPad). Larger files are refused with a clear message, and `maxTransferMb` (512 MB by default) lowers the limit further.

The title font is configured separately, in `font.config.json`, because it is a build-time choice
(see below).

## Customize

**Name.** Set `name` in `config.json`. It is the page title and heading, and there is nothing else to edit. It is not translated. The title font is wide: with the default settings keep the name to 9 characters or fewer, or lower `titleSize` in `font.config.json` and run `npm run font`. vWire prints a warning at startup if the name is too long.

**Languages.** The language is detected from the browser, with English as the fallback. Translations are the
files in `public/locales`, named after the language (`en.json`, `it.json`, `pt-BR.json`, `zh-TW.json`...).
To add a language, copy the file in that folder and run `npm test`: it checks that every key and placeholder
matches `en.json`. No restart and no code change needed; the server lists the files by itself.

**Title font.** Edit `font.config.json` (any family from [Google Fonts](https://fonts.google.com)) and run
`npm run font`. The font is downloaded once and served by your own server, so visitors never contact Google.
Commit the result.

**Colors.** The background is a random dark color at every load. See `public/js/theme.js`.

## Development

```bash
npm install          # includes the Less compiler
npm test             # unit and integration tests (node --test; ignores config.json)
npm run build:css    # public/css/style.less -> style.css (commit the result)
npm run font         # download the title font set in font.config.json
```

Layout:

```
server/    HTTP server, WebSocket signaling, sessions, rate limit
public/    the web app (index.html, js/ modules, css/, locales/, fonts/, vendor/)
test/      tests
scripts/   font downloader
deploy/    systemd, nginx and Caddy examples
support/   helpers used by the tests
```

Work happens on the `develop` branch; `main` holds stable releases.

## License

[MIT](LICENSE). Third-party components are listed in [THIRD_PARTY.md](THIRD_PARTY.md).
