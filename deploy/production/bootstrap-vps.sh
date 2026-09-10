#!/usr/bin/env bash
# Based on notes-sync-app: dedicated service, shared data, SSH releases.
# Deliberately does not replace Node, SSH keys, existing sites, or firewall rules.
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run as root on the VPS.' >&2; exit 1; }
: "${APP_HOST:?Set APP_HOST to the new app hostname (not notes.flare.pet)}"
[[ "$APP_HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]+$ && "$APP_HOST" != notes.flare.pet ]] || { echo 'Choose a separate valid hostname.' >&2; exit 1; }
DEPLOY_USER=${DEPLOY_USER:-github-deploy}
[[ "$DEPLOY_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || exit 1
id "$DEPLOY_USER" >/dev/null 2>&1 || { echo 'Create the SSH deploy user and authorize its key first, as in notes-sync-app.' >&2; exit 1; }
for command in nginx curl visudo systemctl; do command -v "$command" >/dev/null || { echo "Install $command first." >&2; exit 1; }; done
test -x /usr/bin/node
/usr/bin/node -e 'if (Number(process.versions.node.split(".")[0]) < 20) process.exit(1)'
base=/var/www/everywhere-tools
app_port=${APP_PORT:-3007}
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
install -d -m 0755 -o "$DEPLOY_USER" -g www-data "$base" "$base/releases"
install -d -m 0750 -o "$DEPLOY_USER" -g www-data "$base/shared"
install -d -m 0770 -o www-data -g www-data "$base/shared/data"
if [[ ! -f "$base/shared/.env.production" ]]; then
    install -m 0640 -o "$DEPLOY_USER" -g www-data "$source_dir/env.example" "$base/shared/.env.production"
    sed -i "s/^PORT=.*/PORT=$app_port/" "$base/shared/.env.production"
fi
install -m 0644 "$source_dir/everywhere-tools.service" /etc/systemd/system/everywhere-tools.service
# Keep any certificate settings from a previous bootstrap.
if [[ ! -f /etc/nginx/sites-available/everywhere-tools.conf ]]; then
    sed -e "s/tools.example.com/$APP_HOST/g" -e "s/127.0.0.1:3007/127.0.0.1:$app_port/g" "$source_dir/nginx.conf.example" > /etc/nginx/sites-available/everywhere-tools.conf
fi
ln -sfn /etc/nginx/sites-available/everywhere-tools.conf /etc/nginx/sites-enabled/everywhere-tools.conf
sudoers_file=$(mktemp)
trap 'rm -f "$sudoers_file"' EXIT
printf '%s ALL=(root) NOPASSWD: /usr/bin/systemctl restart everywhere-tools, /usr/bin/systemctl stop everywhere-tools, /usr/bin/systemctl reload nginx, /bin/systemctl restart everywhere-tools, /bin/systemctl stop everywhere-tools, /bin/systemctl reload nginx\n' "$DEPLOY_USER" > "$sudoers_file"
visudo -cf "$sudoers_file"
install -m 0440 "$sudoers_file" /etc/sudoers.d/everywhere-tools-deploy
systemctl daemon-reload
systemctl enable everywhere-tools
nginx -t
systemctl reload nginx
echo 'Prepared Everywhere Tools. Configure HTTPS and the GitHub production environment, then run its deployment workflow.'
