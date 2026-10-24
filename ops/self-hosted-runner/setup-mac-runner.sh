#!/usr/bin/env bash
# One-time setup of the SkipWait GitHub Actions runner on the founder's Mac.
# Usage:  RUNNER_TOKEN=<registration token, valid 1 hour> bash setup-mac-runner.sh
# Safe to re-run: skips what is already installed. Runs as the current macOS user.
set -euo pipefail
: "${RUNNER_TOKEN:?Set RUNNER_TOKEN to the registration token (valid for 1 hour)}"
REPO_URL=https://github.com/ayodhyamohanthy/skipwaitmanus
VERSION=2.337.0
DIR="$HOME/actions-runner-skipwait"

[[ "$(uname -s)" == "Darwin" ]] || { echo "This script is for macOS"; exit 1; }
case "$(uname -m)" in arm64) ARCH=arm64 ;; x86_64) ARCH=x64 ;; *) echo "Unknown CPU $(uname -m)"; exit 1 ;; esac
echo "macOS $(sw_vers -productVersion), CPU $ARCH"

# 1. Tools the workflows call: jq, mysql client (migrations + prod reads), coreutils, Docker (container image build).
command -v brew >/dev/null || { echo "Homebrew is missing. Install it from https://brew.sh, then re-run."; exit 1; }
brew list jq >/dev/null 2>&1 || brew install jq
brew list mysql-client >/dev/null 2>&1 || brew install mysql-client
brew list coreutils >/dev/null 2>&1 || brew install coreutils
if ! command -v docker >/dev/null; then brew install --cask docker; echo "Open Docker Desktop once, accept its prompts, then re-run this script."; exit 2; fi
docker info >/dev/null 2>&1 || { echo "Docker Desktop is installed but not running. Open it, wait for 'Engine running', then re-run."; exit 2; }
if [[ "$ARCH" == arm64 ]]; then /usr/bin/pgrep -q oahd || softwareupdate --install-rosetta --agree-to-license || true; fi

# 2. Download and unpack the runner.
mkdir -p "$DIR" && cd "$DIR"
if [[ ! -x ./config.sh ]]; then
  curl -fsSL -o runner.tar.gz "https://github.com/actions/runner/releases/download/v${VERSION}/actions-runner-osx-${ARCH}-${VERSION}.tar.gz"
  tar xzf runner.tar.gz && rm runner.tar.gz
fi

# 3. Register with the repo (label skipwait-mac). --replace lets a re-run take over the same name.
if [[ ! -f .runner ]]; then
  ./config.sh --unattended --url "$REPO_URL" --token "$RUNNER_TOKEN" --name "skipwait-mac" --labels "skipwait-mac" --work _work --replace
fi

# 4. PATH the service will see (Homebrew + keg-only mysql-client + coreutils + Docker).
BREW="$(brew --prefix)"
echo "$BREW/opt/mysql-client/bin:$BREW/opt/coreutils/libexec/gnubin:$BREW/bin:$BREW/sbin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:/usr/bin:/bin:/usr/sbin:/sbin" > .path

# 5. Install as a LaunchAgent so it starts on login and after reboots.
./svc.sh status >/dev/null 2>&1 && ./svc.sh stop >/dev/null 2>&1 || true
./svc.sh install >/dev/null 2>&1 || true
./svc.sh start
./svc.sh status
echo
echo "Done. Runner 'skipwait-mac' should show Idle at $REPO_URL/settings/actions/runners"
echo "Keep the Mac awake while deploys run: System Settings > Displays/Battery > prevent sleep when display is off (on power adapter)."
