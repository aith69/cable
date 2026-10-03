# Cable

Send a file from one device to another, straight from the browser, using a QR code.
Nothing to install, and **the file never touches the server**: it travels directly between the two
devices (WebRTC). The server only introduces the two devices to each other.

Works between phone and phone, computer and phone, and computer and computer.

## How it works

1. On the first device choose **Send a file** (and pick the file) or **Receive a file**. A QR code appears.
2. The other device scans the QR code with its camera. If the first device sends, the transfer starts;
   if it receives, the second device taps **Upload file** and picks the file.
3. A progress bar shows speed and time left. Either device can stop the transfer at any time.

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
git clone https://github.com/aith69/cable.git
cd cable
npm ci --omit=dev
npm start
```

Open `http://localhost:3000`. To use it from your phone on the same network, open `http://<computer-ip>:3000`.
The compiled CSS, the QR library and the font are included in the repository, so no build step is needed.

## Install as a service (Debian / Arch)

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin cable
sudo git clone https://github.com/aith69/cable.git /opt/cable
cd /opt/cable
sudo npm ci --omit=dev
sudo chmod -R go+rX /opt/cable
sudo cp deploy/cable.service /etc/systemd/system/cable.service
sudo systemctl daemon-reload
sudo systemctl enable --now cable
curl http://localhost:3000/health
```

The service runs as an unprivileged user and cannot write anywhere on the system. Edit the `Environment=`
lines in the unit file to change the settings below, then `sudo systemctl restart cable`.
Check the node path in `ExecStart` with `command -v node`.

Update:

```bash
cd /opt/cable && sudo git pull && sudo npm ci --omit=dev && sudo systemctl restart cable
```

## Behind a reverse proxy

Cable needs the proxy to forward WebSockets on `/ws`. Ready-to-edit examples:

- nginx: [`deploy/nginx.conf.example`](deploy/nginx.conf.example)
- Caddy: [`deploy/Caddyfile.example`](deploy/Caddyfile.example)

Set `TRUST_PROXY=true` so that the server reads the client address from the `X-Real-IP` header; the examples
set it. Only do this when the server can be reached through the proxy alone (for example `HOST=127.0.0.1`),
otherwise anyone could fake the header and dodge the limit on wrong codes.

## Configuration

Environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Listening port |
| `HOST` | `0.0.0.0` | Listening address (`127.0.0.1` = this machine only) |
| `SESSION_TTL_MS` | `60000` | How long a QR code or code stays valid while nobody has connected |
| `MAX_SESSIONS` | `1000` | Maximum number of waiting sessions |
| `TRUST_PROXY` | `false` | Read the client address from `X-Real-IP` (behind a reverse proxy only) |
| `CODE_ATTEMPTS` | `3` | Wrong codes allowed per client in the window below |
| `CODE_ATTEMPT_WINDOW_MS` | `60000` | Length of that window |
| `ICE_SERVERS` | Google STUN | JSON list of STUN/TURN servers. `[]` = local network only |

Example with a TURN server (useful on strict networks, such as some mobile carriers; note that when a TURN
server is used the encrypted data goes through it):

```
ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:turn.example.org:3478","username":"user","credential":"secret"}]
```

Limits: the receiving device keeps the file in memory until the transfer ends, so files are limited to
**2 GiB** (**1 GiB** on iPhone and iPad). Larger files are refused with a clear message.

## Customize

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
npm test             # unit and integration tests (node --test, no extra dependencies)
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
