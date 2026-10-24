#!/usr/bin/env bash
# Plan B when GitHub is slow/unreachable: serve this repo as a writable git remote on the LAN.
# Run on A's laptop from the repo root. Ctrl+C stops it. LAN/hotspot only: git:// has no auth.
set -euo pipefail
LAN_DIR="${HOME}/sizzle-lan"
REPO="${LAN_DIR}/sizzle.git"
mkdir -p "${LAN_DIR}"
if [ ! -d "${REPO}" ]; then
  git clone --bare . "${REPO}"
  git -C "${REPO}" config daemon.receivepack true
  echo "created ${REPO}"
fi
git push "${REPO}" main:main || true
IP=$( (ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}') | head -n1 )
echo ""
echo "Teammates run:   git remote add lan git://${IP:-<your-ip>}/sizzle.git"
echo "Then:            git pull --rebase lan main   /   git push lan <branch>"
echo ""
exec git daemon --reuseaddr --base-path="${LAN_DIR}" --export-all --enable=receive-pack --informative-errors --verbose
