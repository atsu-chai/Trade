#!/bin/zsh
set -eu

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR"

if [[ ! -f .env ]]; then
  echo "codex-loop/.env is missing" >&2
  exit 1
fi

set -a
source .env
set +a
exec /usr/bin/env node worker.mjs
