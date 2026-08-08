#!/bin/sh

set -eu

BIN="sk"

main() {
  OS="$(uname -s)"
  case "$OS" in
    Linux) os="linux" ;;
    Darwin) os="macos" ;;
    *) err "unsupported OS: $OS" ;;
  esac

  log "detected ${os}"

  installed="$(which sk)"

  node_installed="n"
  if ! command -v "node" >/dev/null 2>&1; then 
    node_installed="y"
  fi

  if [[ "$node_installed" == "y" ]]; then 
    warn "node.js detected. Installing via NPM"
    npm install -g @skilldrophq/skilldrop

    log "installation completed"
    log "run 'sk --help' to get started"

    exit 0
  fi

  need brew

  log "installing via Homebrew"

  brew tap skilldrophq/tap
  brew trust skilldrophq/tap
  brew install skilldrophq/tap/skilldrop

  log "installation completed"
  log "run 'sk --help' to get started"
}

log()  { printf '  \033[32m>\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
err()  { printf '  \033[31mâœ—\033[0m %s\n' "$1" >&2; exit 1; }

need() {
  if ! command -v "$1" >/dev/null 2>&1; then 
    err "'$1' required but not present. Install it first or download a binary from https://github.com/skilldrophq/skilldrop"
  fi
}

main "$@"
