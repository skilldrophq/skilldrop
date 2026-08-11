#!/bin/sh

set -eu

BIN="sk"
NPM_PACKAGE="@skilldrophq/cli"
BREW_FORMULA="skilldrophq/tap/skilldrop"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  GREEN='\033[32m'
  YELLOW='\033[33m'
  RED='\033[31m'
  RESET='\033[0m'
else
  GREEN=''
  YELLOW=''
  RED=''
  RESET=''
fi

log()  { printf '  %b>%b %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '  %b!%b %s\n' "$YELLOW" "$RESET" "$1" >&2; }
err()  { printf '  %bx%b %s\n' "$RED" "$RESET" "$1" >&2; exit 1; }

node_major_version() {
  node -p "process.versions.node.split('.')[0]" 2>/dev/null
}

can_install_with_npm() {
  command -v npm >/dev/null 2>&1 || return 1
  command -v node >/dev/null 2>&1 || return 1
  major="$(node_major_version)" || return 1
  case "$major" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$major" -ge 20 ]
}

verify_installation() {
  if ! command -v "$BIN" >/dev/null 2>&1; then
    err "installation finished, but 'sk' is not on PATH. Restart your shell or add your package manager's bin directory to PATH"
  fi
  version="$($BIN --version 2>/dev/null)" || err "'sk' was installed but could not be executed"
  log "installed ${version}"
  log "run 'sk --help' to get started"
}

install_with_npm() {
  log "installing ${NPM_PACKAGE} with npm"
  if npm install --global "$NPM_PACKAGE"; then
    verify_installation
    return 0
  fi
  warn "npm installation failed"
  return 1
}

install_with_homebrew() {
  log "installing ${BREW_FORMULA} with Homebrew"
  brew tap skilldrophq/tap
  brew install "$BREW_FORMULA"
  verify_installation
}

main() {
  os_name="$(uname -s)"
  case "$os_name" in
    Darwin) os="macOS" ;;
    Linux) os="Linux" ;;
    *) err "unsupported operating system: ${os_name}" ;;
  esac
  log "detected ${os}"

  if command -v "$BIN" >/dev/null 2>&1; then
    current="$($BIN --version 2>/dev/null || true)"
    if [ -n "$current" ]; then
      log "existing installation: ${current}"
    else
      warn "an existing 'sk' command was found but could not report its version"
    fi
  fi

  if can_install_with_npm; then
    if install_with_npm; then
      return 0
    fi
  elif command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    detected_node="$(node --version 2>/dev/null || printf 'unknown')"
    warn "npm requires Node.js 20 or newer; found ${detected_node}"
  fi

  if command -v brew >/dev/null 2>&1; then
    install_with_homebrew
    return 0
  fi

  err "no supported installer is available. Install Node.js 20+ with npm, or install Homebrew, then try again"
}

main "$@"
