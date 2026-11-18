#!/usr/bin/env bash
#
# Updates baroo on the venue's Raspberry Pi from this checkout, over the local network - for
# a Pi with no internet of its own: nothing on it gets downloaded or installed.
#
#   npm run deploy-pi -- [--host 192.168.2.17] [--user pi] [--port 5173] [--dry-run]
#
# Run it with this computer on the Pi's network. It deploys the commit checked out here
# (uncommitted changes are refused), and:
#
#   1. asks the Pi which service serves baroo on --port, how it runs it and from where
#   2. checks that the Pi has the same dependencies (package-lock.json): it can't install any
#   3. shows the plan and waits for a yes - --dry-run stops here
#   4. backs up the app's files on the Pi to ~/baroo-backup-<time>.tgz
#   5. copies the new files over the old ones, adding and replacing, never deleting, and
#      leaves .env, node_modules, .git and data/ (PocketBase) alone
#   6. restarts the service and waits for /api/heartbeat to answer
#
# The Pi's password is asked once, sudo's maybe once more. Whatever it prints also goes to
# data/_deploy/pi-<time>.log.
#
# Other options:
#   --service NAME    the systemd service, when it can't tell which one it is
#   --mode MODE       how the service runs baroo, when it guesses wrong: dev (vite dev, from
#                     the source), preview (vite preview of a build) or node (node build)
#   --ssh-port PORT   the Pi's ssh port, 22 by default
#   --yes             no question before the update
# DEPLOY_SSH_OPTS     extra options for ssh, e.g. "-i ~/.ssh/pi_key"

set -u -o pipefail

HOST=192.168.2.17
PI_USER=pi
PORT=5173
SSH_PORT=22
SERVICE=""
MODE=""
DRY_RUN=""
YES=""

usage() { sed -n '3,31p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
    case "$1" in
        --host) HOST="$2"; shift 2 ;;
        --user) PI_USER="$2"; shift 2 ;;
        --port) PORT="$2"; shift 2 ;;
        --ssh-port) SSH_PORT="$2"; shift 2 ;;
        --service) SERVICE="$2"; shift 2 ;;
        --mode) MODE="$2"; shift 2 ;;
        --dry-run) DRY_RUN=1; shift ;;
        --yes) YES=1; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "unknown option: $1"; usage; exit 2 ;;
    esac
done

case "$MODE" in ""|dev|preview|node) ;; *) echo "--mode is dev, preview or node"; exit 2 ;; esac

cd "$(dirname "$0")/.." || exit 1
ROOT=$(pwd)
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p data/_deploy
LOG="$ROOT/data/_deploy/pi-$STAMP.log"
exec > >(tee -a "$LOG") 2>&1

step() { printf '\n== %s\n' "$*"; }
info() { printf '   %s\n' "$*"; }
die() {
    printf '\n!! %s\n' "$*"
    printf '   Nothing more was done. Log: %s\n' "$LOG"
    exit 1
}
q() { printf '%q' "$1"; }

# One connection for everything, so the password is asked once.
CONTROL="/tmp/baroo-deploy-$$"
SSH_BASE="ssh -o ControlMaster=auto -o ControlPath=$CONTROL -o ControlPersist=15m -o ConnectTimeout=10 -p $SSH_PORT ${DEPLOY_SSH_OPTS:-}"
remote() { $SSH_BASE "$PI_USER@$HOST" "$@"; }
# Feeding it this script's stdin
remote_in() { $SSH_BASE "$PI_USER@$HOST" "$@"; }
# With a terminal, for sudo to ask its password on.
remote_tty() { $SSH_BASE -t "$PI_USER@$HOST" "$@" </dev/tty; }
cleanup() { ssh -o "ControlPath=$CONTROL" -O exit "$PI_USER@$HOST" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# --- what gets deployed ----------------------------------------------------------------------

step "Deploying from $ROOT"
[ -z "$(git status --porcelain)" ] \
    || die "There are uncommitted changes here. Only commits get deployed: commit them, or stash them."
COMMIT=$(git rev-parse --short HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
SUBJECT=$(git log -1 --format=%s)
LOCK_HERE=$(git show HEAD:package-lock.json | shasum -a 256 | cut -d' ' -f1)
info "$BRANCH @ $COMMIT  $SUBJECT"

# --- the Pi ----------------------------------------------------------------------------------

step "Connecting to $PI_USER@$HOST (type the Pi's password if it asks)"
remote true || die "Can't log in to the Pi over ssh. Is this computer on the Pi's network? Are --host and --user right?"
info "connected"

step "Looking for what serves baroo on port $PORT"
# Prints key=value lines. The process listening on the port says which service runs it and
# where; the service files are the fallback when it isn't running.
DISCOVER='
port=$1
S=
if [ "$(id -u)" != 0 ]; then
    if sudo -n true 2>/dev/null; then S="sudo -n"; else echo "sudo=password"; fi
fi
echo "me=$(id -un)"
echo "home=$HOME"
pid=$($S ss -ltnp 2>/dev/null | grep -E ":$port[[:space:]]" | grep -o "pid=[0-9]*" | head -n1 | cut -d= -f2)
echo "pid=$pid"
if [ -n "$pid" ]; then
    echo "cmd=$(tr "\0" " " < /proc/$pid/cmdline 2>/dev/null)"
    echo "cwd=$($S readlink /proc/$pid/cwd 2>/dev/null)"
    echo "unit=$(ps -o unit= -p "$pid" 2>/dev/null | tr -d " ")"
    echo "uunit=$(ps -o uunit= -p "$pid" 2>/dev/null | tr -d " ")"
fi
for f in /etc/systemd/system/*.service "$HOME"/.config/systemd/user/*.service; do
    [ -f "$f" ] && grep -qiE "baroo|vite|npm|node" "$f" && echo "candidate=$f"
done
true
'
FOUND=$(remote_in bash -s -- "$PORT" <<<"$DISCOVER") || die "Couldn't look around on the Pi."

ME="" HOME_THERE="" PID="" CMD="" CWD="" UNIT_PS="" UUNIT_PS="" CANDIDATES="" SUDO_ASKS=""
while IFS= read -r line; do
    key=${line%%=*} value=${line#*=}
    case "$key" in
        me) ME=$value ;;
        home) HOME_THERE=$value ;;
        pid) PID=$value ;;
        cmd) CMD=$value ;;
        cwd) CWD=$value ;;
        unit) UNIT_PS=$value ;;
        uunit) UUNIT_PS=$value ;;
        candidate) CANDIDATES="$CANDIDATES$value"$'\n' ;;
        sudo) SUDO_ASKS=1 ;;
    esac
done <<<"$FOUND"

if [ -n "$PID" ]; then
    info "port $PORT: process $PID: $CMD"
    [ -n "$CWD" ] && info "running in $CWD"
else
    info "nothing listens on port $PORT (or it can't be seen without sudo)"
fi
[ -n "$CANDIDATES" ] && info "service files mentioning node, npm, vite or baroo:" \
    && printf '%s' "$CANDIDATES" | sed 's/^/     /'

SCOPE=system
UNIT=""
if [ -n "$SERVICE" ]; then
    UNIT=$SERVICE
    case "$UNIT" in *.service) ;; *) UNIT="$UNIT.service" ;; esac
    printf '%s' "$CANDIDATES" | grep -q "/.config/systemd/user/$UNIT\$" && SCOPE=user
else
    case "$UNIT_PS" in
        user@*|-|"") ;;
        *.service) UNIT=$UNIT_PS ;;
    esac
    if [ -z "$UNIT" ]; then
        case "$UUNIT_PS" in *.service) UNIT=$UUNIT_PS; SCOPE=user ;; esac
    fi
    if [ -z "$UNIT" ]; then
        count=$(printf '%s' "$CANDIDATES" | grep -c . || true)
        if [ "$count" = 1 ]; then
            file=$(printf '%s' "$CANDIDATES" | head -n1)
            UNIT=$(basename "$file")
            case "$file" in */.config/systemd/user/*) SCOPE=user ;; esac
        elif [ "$count" = 0 ]; then
            info "running node processes:"
            remote "ps -eo user,pid,args | grep -E '[n]ode|[v]ite|[n]pm' | head -n 20" | sed 's/^/     /'
            die "Found no systemd service for baroo. Pass --service NAME if it has one; send this log otherwise."
        else
            die "More than one service could be it - pass the right one: --service NAME"
        fi
    fi
fi

if [ "$SCOPE" = user ]; then SCTL="systemctl --user"; JCTL="journalctl --user"; else SCTL="systemctl"; JCTL="journalctl"; fi
PROPS=$(remote "$SCTL show $(q "$UNIT") -p LoadState -p ActiveState -p User -p WorkingDirectory -p ExecStart -p FragmentPath") \
    || die "Couldn't ask systemd about $UNIT."

LOAD="" ACTIVE="" SVC_USER="" WD="" EXEC="" FRAGMENT=""
while IFS= read -r line; do
    key=${line%%=*} value=${line#*=}
    case "$key" in
        LoadState) LOAD=$value ;;
        ActiveState) ACTIVE=$value ;;
        User) SVC_USER=$value ;;
        WorkingDirectory) WD=$value ;;
        ExecStart) EXEC=$value ;;
        FragmentPath) FRAGMENT=$value ;;
    esac
done <<<"$PROPS"
[ "$LOAD" = loaded ] || die "systemd doesn't know $UNIT ($SCOPE service)."

# The command alone, out of systemd's "{ path=... ; argv[]=... ; ... }"
ARGV=$(printf '%s' "$EXEC" | sed -n 's/.*argv\[\]=\([^;]*\);.*/\1/p' | sed 's/ *$//')
[ -n "$ARGV" ] || ARGV=$EXEC

if [ -z "$MODE" ]; then
    case "$CMD $ARGV" in
        *vite*preview*|*"run preview"*) MODE=preview ;;
        *vite*|*"run dev"*) MODE=dev ;;
        *) MODE=node ;;
    esac
fi

rexists() { remote "test -e $(q "$1")"; }

APP_DIR=""
if [ "$MODE" = node ]; then
    for dir in "$WD/build" "$WD" "$CWD/build" "$CWD"; do
        [ "$dir" = "/build" ] || [ "$dir" = "" ] && continue
        if rexists "$dir/handler.js"; then APP_DIR=$dir; break; fi
    done
    [ -n "$APP_DIR" ] || die "Found no built app (handler.js) where $UNIT runs. Pass --mode if it isn't 'node build'."
else
    for dir in "$WD" "$CWD"; do
        [ -n "$dir" ] || continue
        if rexists "$dir/svelte.config.js"; then APP_DIR=$dir; break; fi
    done
    [ -n "$APP_DIR" ] || die "Found no baroo checkout (svelte.config.js) where $UNIT runs."
fi

OWNER=$(remote "stat -c %U $(q "$APP_DIR")") || die "Can't read $APP_DIR on the Pi."

# The Pi can't install anything: the same lock file, or no go.
LOCK_THERE=""
for lock in "$APP_DIR/package-lock.json" "$(dirname "$APP_DIR")/package-lock.json"; do
    LOCK_THERE=$(remote "sha256sum $(q "$lock") 2>/dev/null | cut -d' ' -f1")
    [ -n "$LOCK_THERE" ] && break
done
if [ "$MODE" = node ]; then
    rexists "$APP_DIR/node_modules" || rexists "$(dirname "$APP_DIR")/node_modules" \
        || die "There is no node_modules next to $APP_DIR on the Pi, and it can't install one."
else
    rexists "$APP_DIR/node_modules/vite/package.json" \
        || die "There is no node_modules with vite in $APP_DIR on the Pi, and it can't install one."
fi

if [ "$LOCK_THERE" = "$LOCK_HERE" ]; then
    DEPS="the same package-lock.json as here"
elif [ -z "$LOCK_THERE" ]; then
    DEPS="UNKNOWN - no package-lock.json on the Pi to compare. If this update changed dependencies, it won't start."
else
    die "The Pi has other dependencies than this commit (package-lock.json differs), and can't install them without internet. Deploy from a computer with internet access to the Pi, or bring node_modules along."
fi

case "$MODE" in
    dev) HOW="copies the source; the Pi's vite dev server builds it as it starts" ;;
    preview) HOW="builds here, copies the source and the build (.svelte-kit/output)" ;;
    node) HOW="builds here, copies the built app (not its node_modules)" ;;
esac

if [ "$OWNER" = "$ME" ]; then AS=""; else AS="sudo -u $(q "$OWNER")"; fi
BACKUP="baroo-backup-$STAMP.tgz"

step "Plan"
info "deploy   $BRANCH @ $COMMIT  $SUBJECT"
info "service  $UNIT ($SCOPE, $ACTIVE${SVC_USER:+, as $SVC_USER})  $FRAGMENT"
info "runs     $ARGV"
info "mode     $MODE: $HOW"
info "into     $APP_DIR (owned by $OWNER)"
info "deps     $DEPS"
info "backup   ~/$BACKUP on the Pi"
info "keeps    .env, node_modules, .git and data/ (PocketBase) as they are"
info "then     restarts $UNIT and waits for https://$HOST:$PORT/api/heartbeat"

if [ -n "$DRY_RUN" ]; then
    printf '\nDry run: nothing changed. Log: %s\n' "$LOG"
    exit 0
fi

if [ -z "$YES" ]; then
    printf '\nGo ahead? [y/N] '
    read -r answer </dev/tty || answer=""
    echo "$answer"
    case "$answer" in y|Y|yes|YES) ;; *) die "Stopped, nothing changed." ;; esac
fi

# --- the update ------------------------------------------------------------------------------

# A command run as root on the Pi - with a terminal when sudo wants a password
rsudo() {
    if [ -n "$SUDO_ASKS" ]; then remote_tty "sudo $1"; else remote "sudo -n $1"; fi
}
# A command run as the owner of the app's files, reading the file `input` - opened by the
# login, who owns it - on its stdin
ras() {
    local command=$1 input=$2
    if [ -z "$AS" ]; then remote "sh -c $(q "$command") < $(q "$input")"
    elif [ -n "$SUDO_ASKS" ]; then remote_tty "sudo -u $(q "$OWNER") sh -c $(q "$command") < $(q "$input")"
    else remote "sudo -n -u $(q "$OWNER") sh -c $(q "$command") < $(q "$input")"
    fi
}

if [ "$MODE" != dev ]; then
    step "Building here"
    ./node_modules/.bin/vite build >"$ROOT/data/_deploy/pi-$STAMP.build.log" 2>&1 \
        || { tail -n 30 "$ROOT/data/_deploy/pi-$STAMP.build.log"; die "The build failed (data/_deploy/pi-$STAMP.build.log)."; }
    info "built"
fi

step "Backing up $APP_DIR to ~/$BACKUP on the Pi"
EXCLUDES="--exclude=./node_modules --exclude=./.git --exclude=./data/pb_data --exclude=./build/node_modules"
[ "$MODE" = dev ] && EXCLUDES="$EXCLUDES --exclude=./.svelte-kit"
TAR_BACKUP="tar -czf $(q "$HOME_THERE/$BACKUP") -C $(q "$APP_DIR") $EXCLUDES ."
if [ -z "$AS" ]; then remote "$TAR_BACKUP"; else rsudo "$TAR_BACKUP"; fi \
    || die "The backup failed, so nothing was copied."
info "$(remote "du -h $(q "$HOME_THERE/$BACKUP") | cut -f1") backed up"

# The files go to the Pi first, then are unpacked from there - as the owner of the app's files.
UPDATE="baroo-update-$STAMP"
send() {
    local name=$1 target=$2
    local file="$HOME_THERE/$UPDATE-$name.tar"
    remote_in "cat > $(q "$file")" || die "Copying to the Pi failed - nothing was replaced yet."
    ras "mkdir -p $(q "$target") && tar -x --warning=no-unknown-keyword -C $(q "$target")" "$file" \
        || die "Unpacking $name into $target failed partway. The backup is ~/$BACKUP."
    remote "rm -f $(q "$file")"
}

export COPYFILE_DISABLE=1
step "Copying"
case "$MODE" in
    dev|preview)
        # Tracked files only - nothing ignored, no .env - and not data/, which is PocketBase's.
        git archive --format=tar HEAD -- . ':(exclude)data' | send source "$APP_DIR"
        info "source of $COMMIT"
        if [ "$MODE" = preview ]; then
            tar -c --no-mac-metadata --no-xattrs -C .svelte-kit output | send output "$APP_DIR/.svelte-kit"
            info "the build (.svelte-kit/output)"
        fi
        ;;
    node)
        tar -c --no-mac-metadata --no-xattrs --exclude ./node_modules --exclude './package*.json' -C build . \
            | send build "$APP_DIR"
        info "the built app"
        ;;
esac
remote "echo $(q "$STAMP $BRANCH $COMMIT $SUBJECT") >> $(q "$HOME_THERE/baroo-deployed.txt")"

step "Restarting $UNIT"
if [ "$SCOPE" = user ]; then remote "$SCTL restart $(q "$UNIT")"; else rsudo "systemctl restart $(q "$UNIT")"; fi \
    || die "The restart failed. Roll back below."

# vite dev on a Pi 3 builds the routes on their first request: minutes, not seconds.
printf '   waiting for /api/heartbeat'
UP=""
for _ in $(seq 1 30); do
    for scheme in https http; do
        code=$(curl -k -s -o /dev/null -w '%{http_code}' --max-time 10 "$scheme://$HOST:$PORT/api/heartbeat" || true)
        case "$code" in
            200) UP=ok; break 2 ;;
            503) UP=no-pb; break 2 ;;
        esac
    done
    printf '.'
    sleep 3
done
echo

# Answering isn't enough: it has to be the restarted service that does.
STATE=$(remote "$SCTL is-active $(q "$UNIT")")
info "$UNIT is $STATE"
[ "$STATE" = active ] || UP=down
info "its log:"
remote "$JCTL -u $(q "$UNIT") -n 25 --no-pager 2>/dev/null || sudo -n $JCTL -u $(q "$UNIT") -n 25 --no-pager" \
    | sed 's/^/     /'

ROLLBACK_EXTRACT="tar -xzf ~/$BACKUP -C $APP_DIR"
[ -n "$AS" ] && ROLLBACK_EXTRACT="$AS $ROLLBACK_EXTRACT"
if [ "$SCOPE" = user ]; then ROLLBACK_RESTART="$SCTL restart $UNIT"; else ROLLBACK_RESTART="sudo systemctl restart $UNIT"; fi

case "$UP" in
    ok) step "Done: $COMMIT runs on the Pi" ;;
    no-pb) step "Done, but: baroo runs and can't reach PocketBase (heartbeat says pb-unreachable)" ;;
    down) step "$UNIT isn't running after the restart - the log above should say why" ;;
    *) step "baroo didn't answer within 6 minutes - the log above may say why" ;;
esac
info "To roll back to what ran before:"
info "  ssh $PI_USER@$HOST"
info "  $ROLLBACK_EXTRACT"
info "  $ROLLBACK_RESTART"
info "Log: $LOG"
[ "$UP" = ok ] || exit 1
