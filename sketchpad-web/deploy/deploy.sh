#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
deploy_host="${SCRATCHPAD_DEPLOY_HOST:-ubuntu@100.55.208.216}"
deploy_key="${SCRATCHPAD_DEPLOY_KEY:-$HOME/.ssh/acyclic-lightsail}"
release="$(date -u +%Y%m%dT%H%M%SZ)"
temp_dir="$(mktemp -d -t scratchpad-release)"
archive="$temp_dir/release.tar.gz"

cleanup() {
	rm -rf "$temp_dir"
}
trap cleanup EXIT

cd "$project_dir"
npm run build
npm test
COPYFILE_DISABLE=1 tar --no-xattrs -C web -czf "$archive" \
	LICENSE-MIT app.js external-input.js index.html machine-worker.js pen-transport.js scope-model.js styles.css visual-capture.js pkg

scp -i "$deploy_key" "$archive" \
	"$deploy_host:/tmp/scratchpad-$release.tar.gz"
scp -i "$deploy_key" "$script_dir/scratchpad.acyclic.sh.caddy" \
	"$deploy_host:/tmp/Scratchpad-$release.caddy"

ssh -i "$deploy_key" "$deploy_host" \
	"sudo install -d -m 0755 /opt/acyclic/Scratchpad/releases/$release &&
	 sudo tar --no-same-owner -xzf /tmp/scratchpad-$release.tar.gz -C /opt/acyclic/Scratchpad/releases/$release &&
	 sudo chown -R root:root /opt/acyclic/Scratchpad/releases/$release &&
	 sudo ln -sfn /opt/acyclic/Scratchpad/releases/$release /opt/acyclic/Scratchpad/current &&
	 sudo install -m 0644 /tmp/Scratchpad-$release.caddy /etc/caddy/sites/Scratchpad.caddy &&
	 sudo caddy validate --config /etc/caddy/Caddyfile &&
	 sudo systemctl reload caddy &&
	 rm -f /tmp/scratchpad-$release.tar.gz /tmp/Scratchpad-$release.caddy"

printf 'Deployed Scratchpad release %s\n' "$release"
