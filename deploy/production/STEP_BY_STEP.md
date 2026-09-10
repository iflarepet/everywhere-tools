# Deploy Everywhere Tools to the VPS

This uses the same VPS/SSH/systemd/Nginx approach as notes-sync-app. Run each step in order and stop if a command fails. These are instructions; no deployment has been performed by Codex.

## 1. Choose the hostname

Use `tools.flare.pet`. Create its DNS A record pointing to `45.77.170.239` if using the same VPS from notes-sync-app. Do not replace the `notes.flare.pet` DNS record or Nginx site.

Make ports 80 and 443 reachable for public HTTP/HTTPS while preserving SSH access. Keep port 3007 private. For private VPN hosting, use the VPN-specific notes in README.md instead of wildcard public listeners.

## 2. Build and upload — Windows PowerShell

```powershell
Set-Location C:\workspace\dev\everywhere-tools
powershell -NoProfile -File deploy/package.ps1
```

Continue only if the script succeeds and prints a release path. It runs build, lint, and all tests before packaging. Upload the newest package with the same authorized SSH identity you use for notes-sync-app:

```powershell
$releaseArchive = Get-ChildItem .\artifacts\*.tar.gz | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$releaseChecksum = $releaseArchive.FullName + '.sha256'
scp $releaseArchive.FullName $releaseChecksum github-deploy@45.77.170.239:/tmp/
$releaseArchive.Name
```

Record the printed filename for the next step. If your SSH key is not the default identity, add `-i C:\path\to\deploy_key` to scp/ssh. If the port differs, use scp `-P PORT` or ssh `-p PORT`. Verify any first-time host fingerprint against the VPS console.

## 3. Connect as a server administrator — VPS shell

Bootstrap needs root privileges; the restricted `github-deploy` account from notes-sync-app may not have them. Connect with the server's existing root or sudo-enabled administrator, then enter a root shell. Do not grant blanket sudo access to the deployment account.

```bash
sudo -i
```

If already logged in as root, skip `sudo -i`. Check prerequisites:

```bash
/usr/bin/node --version
nginx -v
command -v curl
command -v visudo
id github-deploy
ss -ltnp '( sport = :3007 )'
```

Port 3007 should be unused. Existing notes-sync-app normally uses 3006. The scripts expect Node at `/usr/bin/node`; use a supported LTS version, preferably 24. If prerequisites are missing, install them through your existing VPS administration process. Do not replace the shared Node runtime without checking the other apps.

## 4. Verify and bootstrap — VPS root shell

Set your actual uploaded filename and new hostname:

```bash
ARCHIVE='everywhere-tools-YYYYMMDD-HHMMSS.tar.gz'
DOMAIN='tools.flare.pet'
cd /tmp
sha256sum -c "$ARCHIVE.sha256"
```

Continue only when the checksum says `OK`:

```bash
STAGING=$(mktemp -d /tmp/everywhere-tools-setup.XXXXXX)
tar --no-same-owner -xzf "/tmp/$ARCHIVE" -C "$STAGING"
APP_HOST="$DOMAIN" bash "$STAGING/deploy/production/bootstrap-vps.sh"
```

This creates `/var/www/everywhere-tools`, a shared environment/data directory, the `everywhere-tools` service, and its own Nginx site. It reuses the existing deploy account and does not overwrite SSH keys. HTTP may show 502 until the first release is activated.

## 5. Install and activate the first release — same VPS root shell

```bash
RELEASE_ID="${ARCHIVE%.tar.gz}"
RELEASE_PATH="/var/www/everywhere-tools/releases/$RELEASE_ID"
test ! -e "$RELEASE_PATH"
```

If the last command fails, that release already exists: inspect it or use a newly built release; do not overwrite it. Otherwise:

```bash
install -d -m 0755 -o github-deploy -g www-data "$RELEASE_PATH"
sudo -u github-deploy tar --no-same-owner -xzf "/tmp/$ARCHIVE" -C "$RELEASE_PATH"
sudo -u github-deploy bash "$RELEASE_PATH/deploy/production/activate.sh" "$RELEASE_PATH"
```

No npm install is required on the VPS. The runtime uses Node built-ins; browser dependencies are bundled into dist.

Verify the running app:

```bash
systemctl status everywhere-tools --no-pager
curl --fail http://127.0.0.1:3007/api/health
curl --fail "http://$DOMAIN/api/health"
```

Expected health response: `{"status":"ok"}`. If localhost works but the hostname fails, check DNS, firewall and Nginx before proceeding.

## 6. Enable HTTPS — VPS administrator

If the server already uses Certbot with Nginx, run:

```bash
certbot --nginx -d "$DOMAIN" --redirect
nginx -t
systemctl reload nginx
curl --fail "https://$DOMAIN/api/health"
certbot renew --dry-run
```

If Certbot is not installed, use the official instructions matching your server before running these commands: https://certbot.eff.org/instructions?ws=nginx&os=snap . Public Nginx certificate issuance needs working DNS and reachable port 80. Private hosts can use DNS validation or trusted internal certificates instead. Do not disable certificate checks to bypass errors.

## 7. Check all five tools

Open `https://YOUR_HOSTNAME/`:

1. Notes: create a session and join from a second device; confirm edits sync.
2. Chat: create a room, join using its code and QR, and exchange messages.
3. Compare text: compare pasted text and two uploaded plain-text files.
4. JSON beautifier: try valid and invalid JSON.
5. JWT decoder: decode a sample token and check readable claims.

Restart `everywhere-tools` and verify notes/chat history survives. Test the phone camera from HTTPS. Room QR codes must be generated using the final hostname rather than localhost.

## 8. Configure GitHub Actions for future releases

Push this project to its own GitHub repository. In Settings → Environments, create `production`. Set:

| Type | Name | Value |
| --- | --- | --- |
| Secret | PROD_SSH_KEY | Authorized private deployment key from the existing server setup |
| Secret | PROD_SSH_KNOWN_HOSTS | VPS host-key entry whose fingerprint you verified through a trusted channel |
| Secret, optional | PROD_SSH_HOST | 45.77.170.239 |
| Secret, optional | PROD_SSH_USER | github-deploy |
| Secret, optional | PROD_SSH_PORT | 22 |
| Variable | PROD_EVERYWHERE_TOOLS_URL | Your final HTTPS origin |

Do not paste private keys into source files or the guide. Use the known-hosts entry matching the exact configured SSH host and port.

Run **Actions → Deploy Everywhere Tools → Run workflow**. The workflow builds/tests, verifies SSH host identity, uploads and checksums a new release, activates it, and checks HTTPS. It is manual-only; a push does not automatically publish. A new repository must have the workflow on its default branch for the manual action to appear.

## Updates, backup and rollback

Before subsequent deployments, stop the service and back up the shared data, then restart it. In a root shell:

```bash
install -d -m 0700 /var/backups/everywhere-tools
BACKUP="/var/backups/everywhere-tools/data-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
systemctl stop everywhere-tools
(umask 077; tar -czf "$BACKUP" -C /var/www/everywhere-tools/shared data)
systemctl start everywhere-tools
```

If backup fails, restart the service and investigate before deploying. Store a protected copy off-server. Shared notes/chat remain outside releases.

A failed startup health check restores the previous release automatically. For manual rollback, pass the previous release directory to its activation script. A code rollback does not undo future data-format migrations. Do not delete current or rollback releases.

For failures, inspect:

```bash
journalctl -u everywhere-tools -n 80 --no-pager
nginx -t
```

Only one application process is supported because persistence is file-backed. Linux services, HTTPS and phone-camera behavior still need validation on the actual VPS.
