#!/usr/bin/env bash
#
# vWire installer: sets up the app in this folder as a systemd service.
# Run it from a checkout, as root:   sudo ./deploy/install.sh
# Running it again is safe: it refreshes the dependencies and the unit, and restarts the service.
#
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
APP_DIR=$(dirname "$SCRIPT_DIR")
CONFIG_PATH="$APP_DIR/config.json"
UNIT_TEMPLATE="$SCRIPT_DIR/vwire.service"

ASSUME_YES=0
DRY_RUN=0
NO_START=0
UNINSTALL=0
PRINT_UNIT=0
WITH_DEV=0
SERVICE=""
SVC_USER="vwire"
SETS=()
NODE_BIN=""
CONFIG_JSON=""
KEEP_CONFIG=0
TMP_CFG=""
PORT=""
HOST=""

trap '[[ -z $TMP_CFG ]] || rm -f "$TMP_CFG"' EXIT

usage() {
  cat <<'USAGE'
Usage: sudo ./deploy/install.sh [options]

Installs vWire (the folder this script lives in) as a systemd service.
Without options it asks a few questions; press Enter to keep the default shown in [brackets].

Options:
  -y, --yes           do not ask anything: use the defaults and the --set values
      --set KEY=VAL   set a configuration value (repeatable), for example --set port=3001
                      keys: name, port, host, trustProxy, sessionTtlMs, maxSessions,
                      codeAttempts, codeAttemptWindowMs, iceServers
                      With --set, config.json is rewritten (the old one is saved as config.json.bak-DATE)
      --service NAME  systemd service name (default: the folder name in lowercase, e.g. vwire-main)
      --user NAME     system user that runs the service (default: vwire, created if missing)
      --with-dev      also install the development dependencies (Less compiler), for a working copy
      --no-start      install the service but do not enable or start it
      --dry-run       show what would be done and change nothing
      --print-unit    print the systemd unit that would be installed, then exit
      --uninstall     stop and remove the service (the folder, config.json and the user are kept)
  -h, --help          show this help

The settings are documented in the README (Configuration).
Everything this script does can also be done by hand (README, "Manual installation").
USAGE
}

say()  { printf '%s\n' "$*"; }
note() { printf '  %s\n' "$*"; }
warn() { printf 'Warning: %s\n' "$*" >&2; }
die()  { printf 'Error: %s\n' "$*" >&2; exit 1; }

run() {
  if (( DRY_RUN )); then printf '  [dry-run] %s\n' "$*"; else "$@"; fi
}

# install_file DEST MODE OWNER:GROUP   (content on stdin; written atomically)
install_file() {
  local dest=$1 mode=$2 owner=$3 tmp
  if (( DRY_RUN )); then
    printf '  [dry-run] write %s (mode %s, owner %s)\n' "$dest" "$mode" "$owner"
    cat >/dev/null
    return 0
  fi
  tmp=$(mktemp "$dest.XXXXXX")
  cat >"$tmp"
  chmod "$mode" "$tmp"
  chown "$owner" "$tmp"
  mv "$tmp" "$dest"
}

need_arg() { [[ $# -ge 2 ]] || die "$1 needs a value"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes) ASSUME_YES=1 ;;
    --set) need_arg "$@"; SETS+=("$2"); shift ;;
    --service) need_arg "$@"; SERVICE=$2; shift ;;
    --user) need_arg "$@"; SVC_USER=$2; shift ;;
    --with-dev) WITH_DEV=1 ;;
    --no-start) NO_START=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --print-unit) PRINT_UNIT=1; DRY_RUN=1 ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1 (try --help)" ;;
  esac
  shift
done

trim() { printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'; }

confirm() { # confirm "Question" y|n   (always yes with --yes)
  (( ASSUME_YES )) && return 0
  local def=$2 reply hint="[Y/n]"
  [[ $def == n ]] && hint="[y/N]"
  read -r -p "$1 $hint: " reply || reply=""
  reply=$(trim "${reply,,}")
  [[ -n $reply ]] || reply=$def
  [[ $reply == y* ]]
}

home_problem() {
  if (( DRY_RUN )); then warn "$1"; else die "$1"; fi
}

default_service() {
  basename "$APP_DIR" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_.\n-' '-'
}

# The helper runs with a clean environment, so stray variables (PORT, HOST...) cannot interfere.
node_tool() {
  ( cd "$APP_DIR" && env -i PATH="$PATH" NODE_ENV=test "$NODE_BIN" scripts/make-config.js "$@" )
}

check_node() {
  NODE_BIN=$(command -v node || true)
  [[ -n $NODE_BIN ]] || die "Node.js was not found. vWire needs Node.js 20 or newer (Arch: pacman -S nodejs npm; Debian: see the README, Requirements)."
  local major
  major=$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')
  (( major >= 20 )) || die "Node.js 20 or newer is required (found $("$NODE_BIN" -v)). See the README, Requirements."
  command -v npm >/dev/null || (( DRY_RUN )) || die "npm was not found (Arch: pacman -S npm; Debian: apt install npm)."
  case $NODE_BIN in
    /home/*|/root/*) home_problem "node is at $NODE_BIN, which the service cannot read (ProtectHome). Install Node.js system-wide." ;;
  esac
}

check_location() {
  case $APP_DIR in
    /home/*|/root|/root/*) home_problem "$APP_DIR is under /home or /root, which the service cannot read (ProtectHome). Move the folder, for example to /opt." ;;
  esac
}

check_unit_free() {
  local unit=/etc/systemd/system/$SERVICE.service wd
  [[ -f $unit ]] || return 0
  wd=$(sed -n 's/^WorkingDirectory=//p' "$unit" | head -n1)
  [[ $wd == "$APP_DIR" ]] || die "the service $SERVICE already exists and points to ${wd:-another folder}. Use --service NAME to pick another name."
}

check_port_free() {
  local port=$1
  (( DRY_RUN )) && return 0
  command -v ss >/dev/null || return 0
  systemctl is-active --quiet "$SERVICE" 2>/dev/null && return 0
  if [[ -n $(ss -H -ltn "sport = :$port" 2>/dev/null) ]]; then
    die "port $port is already in use. Stop the program using it (an old service: ./deploy/install.sh --uninstall --service OLD-NAME) or pick another port."
  fi
}

ensure_user() {
  local uid nologin
  if getent passwd "$SVC_USER" >/dev/null; then
    uid=$(id -u "$SVC_USER")
    (( uid < 1000 )) || die "\"$SVC_USER\" is a regular account (uid $uid). Pick a dedicated system user with --user."
    note "user $SVC_USER: already exists"
  else
    nologin=$(command -v nologin || echo /usr/sbin/nologin)
    run useradd --system --no-create-home --user-group --shell "$nologin" "$SVC_USER"
    note "user $SVC_USER: created"
  fi
}

render_unit() {
  awk \
    -v desc="Description=vWire ($SERVICE) - direct file transfer via QR code" \
    -v user="User=$SVC_USER" \
    -v group="Group=$SVC_USER" \
    -v wd="WorkingDirectory=$APP_DIR" \
    -v cmd="ExecStart=$NODE_BIN server/index.js" '
    /^Description=/ { print desc; next }
    /^User=/ { print user; next }
    /^Group=/ { print group; next }
    /^WorkingDirectory=/ { print wd; next }
    /^ExecStart=/ { print cmd; next }
    { print }' "$UNIT_TEMPLATE"
}

prompt_setting() { # prompt_setting KEY "Question"
  local key=$1 question=$2 default reply err
  default=$(node_tool --get "$key")
  while true; do
    read -r -p "$question [$default]: " reply || reply=""
    reply=$(trim "$reply")
    [[ -n $reply ]] || return 0
    if err=$(node_tool "$key=$reply" 2>&1 >/dev/null); then
      [[ -z $err ]] || note "$err"
      SETS+=("$key=$reply")
      return 0
    fi
    note "$err"
  done
}

collect_settings() {
  if [[ -f $CONFIG_PATH ]]; then
    node_tool --get port "$CONFIG_PATH" >/dev/null || die "the existing $CONFIG_PATH is not valid: fix or remove it, then run again."
    if (( ${#SETS[@]} == 0 )); then
      if (( ASSUME_YES )) || confirm "A config.json already exists. Keep it and skip the questions?" y; then
        KEEP_CONFIG=1
      fi
    fi
  fi
  if (( KEEP_CONFIG || ASSUME_YES || ${#SETS[@]} > 0 )); then return 0; fi

  [[ -t 0 ]] || die "not running in a terminal: use --yes (and --set KEY=VALUE for the settings)."
  say ""
  say "Settings (press Enter to keep the default shown in [brackets])"
  prompt_setting name "Name shown in the page title"
  prompt_setting port "Port"
  prompt_setting host "Listen address (0.0.0.0 = all interfaces, 127.0.0.1 = this machine only)"
  prompt_setting trustProxy "Behind a reverse proxy such as nginx or Caddy? (true/false)"
  prompt_setting sessionTtlMs "How long a QR code stays valid while nobody has connected, in milliseconds"
  if confirm "Change the advanced settings too?" n; then
    prompt_setting maxSessions "Maximum number of waiting sessions"
    prompt_setting codeAttempts "Wrong codes allowed per client in the window below"
    prompt_setting codeAttemptWindowMs "Length of that window, in milliseconds"
    prompt_setting iceServers "STUN/TURN servers as JSON ([] = local network only)"
  fi
}

build_config() {
  if (( ${#SETS[@]} )); then
    CONFIG_JSON=$(node_tool "${SETS[@]}") || die "invalid settings (see above)."
  elif [[ -f $CONFIG_PATH ]] && (( ! KEEP_CONFIG )); then
    CONFIG_JSON='{}'
  else
    return 0
  fi
  TMP_CFG=$(mktemp)
  printf '%s\n' "$CONFIG_JSON" >"$TMP_CFG"
}

effective() { # effective KEY: the value the service will use
  if [[ -n $CONFIG_JSON ]]; then node_tool --get "$1" "$TMP_CFG"
  elif [[ -f $CONFIG_PATH ]]; then node_tool --get "$1" "$CONFIG_PATH"
  else node_tool --get "$1"
  fi
}

summary() {
  say ""
  say "About to install:"
  note "folder:   $APP_DIR"
  note "service:  $SERVICE (runs as user $SVC_USER)"
  note "node:     $NODE_BIN ($("$NODE_BIN" -v))"
  if [[ -n $CONFIG_JSON ]]; then
    note "settings (written to config.json):"
    printf '%s\n' "$CONFIG_JSON" | sed 's/^/      /'
  elif (( KEEP_CONFIG )); then
    note "settings: keeping the existing config.json (port $PORT)"
  else
    note "settings: all defaults, no config.json (port $PORT)"
  fi
  if (( NO_START )); then note "the service will be installed but not started"
  else note "the service will be enabled and started"; fi
  if [[ $(effective trustProxy) == true && $HOST == 0.0.0.0 ]]; then
    note "note: trustProxy is on and the port is open on every interface: only let the reverse proxy reach it (firewall), or clients could fake their address."
  fi
  say ""
}

wait_healthy() {
  local host=$1 port=$2 i
  case $host in 0.0.0.0|::) host=127.0.0.1 ;; esac
  [[ $host == *:* ]] && host="[$host]"
  for i in $(seq 1 15); do
    if "$NODE_BIN" -e 'fetch(`http://${process.argv[1]}:${process.argv[2]}/health`).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))' "$host" "$port" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

do_install() {
  local unit=/etc/systemd/system/$SERVICE.service npm_args
  say "Installing"
  npm_args=(ci --ignore-scripts --no-audit --no-fund)
  (( WITH_DEV )) || npm_args+=(--omit=dev)
  note "dependencies: npm ${npm_args[*]}"
  ( cd "$APP_DIR" && run npm "${npm_args[@]}" )
  ensure_user
  run chmod -R go+rX "$APP_DIR"

  if [[ -n $CONFIG_JSON ]]; then
    if [[ -f $CONFIG_PATH ]]; then
      run cp -p "$CONFIG_PATH" "$CONFIG_PATH.bak-$(date +%Y%m%d-%H%M%S)"
    fi
    printf '%s\n' "$CONFIG_JSON" | install_file "$CONFIG_PATH" 640 "root:$SVC_USER"
    note "config.json written"
  elif [[ -f $CONFIG_PATH ]]; then
    run chown "root:$SVC_USER" "$CONFIG_PATH"
    run chmod 640 "$CONFIG_PATH"
  fi

  render_unit | install_file "$unit" 644 root:root
  note "unit: $unit"
  run systemctl daemon-reload

  if (( NO_START )); then
    say "Done. The service was not started: sudo systemctl enable --now $SERVICE"
    return 0
  fi
  run systemctl enable "$SERVICE"
  run systemctl restart "$SERVICE"
  if (( DRY_RUN )); then
    say "Dry run finished: nothing was changed."
    return 0
  fi

  if wait_healthy "$HOST" "$PORT"; then
    say ""
    say "Done: $SERVICE is running."
    note "address:  http://<this-machine>:$PORT"
    note "status:   systemctl status $SERVICE"
    note "logs:     journalctl -u $SERVICE -f"
    note "restart:  systemctl restart $SERVICE"
    note "update:   cd $APP_DIR && git pull && sudo ./deploy/install.sh --yes"
  else
    journalctl -u "$SERVICE" -n 20 --no-pager || true
    die "the service did not answer on port $PORT. See the log above (journalctl -u $SERVICE)."
  fi
}

do_uninstall() {
  local unit=/etc/systemd/system/$SERVICE.service
  [[ -f $unit ]] || die "service $SERVICE not found ($unit)."
  confirm "Stop, disable and remove the service $SERVICE? Folder, config.json and user are kept." n \
    || { say "Cancelled."; return 0; }
  run systemctl disable --now "$SERVICE" || true
  run rm -f "$unit"
  run systemctl daemon-reload
  say "Service $SERVICE removed. To delete the user as well: userdel $SVC_USER (only if no other service uses it)."
}

main() {
  [[ -f $APP_DIR/server/index.js && -f $UNIT_TEMPLATE ]] \
    || die "run this script from a vWire checkout (server/index.js or deploy/vwire.service not found in $APP_DIR)."
  [[ $APP_DIR != *[[:space:]]* ]] || die "the folder path must not contain spaces: $APP_DIR"
  [[ -n $SERVICE ]] || SERVICE=$(default_service)
  [[ $SERVICE =~ ^[a-z0-9][a-z0-9_.-]*$ ]] || die "invalid service name \"$SERVICE\" (lowercase letters, digits, - _ . only)."
  [[ $SVC_USER =~ ^[a-z_][a-z0-9_-]*$ ]] || die "invalid user name \"$SVC_USER\"."

  if (( PRINT_UNIT )); then
    check_node
    render_unit
    return 0
  fi
  if (( ! DRY_RUN )); then
    (( EUID == 0 )) || die "run as root, for example: sudo ./deploy/install.sh"
    command -v systemctl >/dev/null || die "systemd (systemctl) was not found: this installer needs systemd."
  fi
  if (( UNINSTALL )); then
    do_uninstall
    return 0
  fi

  check_node
  check_location
  check_unit_free
  collect_settings
  build_config
  PORT=$(effective port)
  HOST=$(effective host)
  summary
  (( NO_START )) || check_port_free "$PORT"
  confirm "Proceed?" y || { say "Cancelled."; return 0; }
  do_install
}

main
