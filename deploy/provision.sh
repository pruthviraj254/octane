#!/usr/bin/env bash
# One-time server setup for Ubuntu 24.04: Node, pnpm, Caddy and the Octane services.
set -euo pipefail

NODE_VERSION=26.5.0
PNPM_VERSION=9.15.4
TARBALL="node-v${NODE_VERSION}-linux-x64.tar.xz"

sudo apt-get update -qq
sudo apt-get install -y -qq curl git xz-utils libatomic1 debian-keyring debian-archive-keyring apt-transport-https

cd /tmp
curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/${TARBALL}"
curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" | grep " ${TARBALL}\$" | sha256sum -c -
sudo rm -rf /opt/node && sudo mkdir -p /opt/node
sudo tar -xJf "$TARBALL" -C /opt/node --strip-components=1
sudo ln -sf /opt/node/bin/node /usr/local/bin/node
sudo /opt/node/bin/npm install -g --silent "pnpm@${PNPM_VERSION}"
sudo ln -sf /opt/node/bin/pnpm /usr/local/bin/pnpm

curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq caddy

node -v
pnpm -v
caddy version
