# Everywhere Tools production deployment

Based on `notes-sync-app/deploy/production` and its GitHub Actions workflow: build locally/on CI, upload a release archive over SSH, switch `current`, restart systemd, and smoke-test through Nginx. These files only prepare deployment; no remote changes have been made.

## Target layout

| Setting | Everywhere Tools |
| --- | --- |
| Default VPS | `45.77.170.239` (same default as notes-sync-app; overridable) |
| SSH user | `github-deploy` |
| App directory | `/var/www/everywhere-tools` |
| Releases | `/var/www/everywhere-tools/releases` |
| Active symlink | `/var/www/everywhere-tools/current` |
| Environment | `/var/www/everywhere-tools/shared/.env.production` |
| Notes and chat data | `/var/www/everywhere-tools/shared/data` |
| Service | `everywhere-tools` (runs as `www-data`) |
| Internal port | `3007`, bound to `127.0.0.1` |
| Hostname | `tools.flare.pet`; do not reuse `notes.flare.pet` |

The existing notes service, port 3006, deployment keys, and data are not modified. The server runtime uses Node built-ins; the release needs no npm install on the VPS. Use a supported Node LTS (Node 24 recommended). CI builds on Node 24. The bootstrap checks basic runtime compatibility but does not replace the existing Node installation, since it may serve other apps.

## One-time VPS bootstrap

Use the existing authorized SSH deploy user from notes-sync-app. Install Nginx, curl, Node, and sudo through the existing server administration process if missing. Upload the `deploy/production` directory, then run as root, replacing the hostname:

```bash
APP_HOST=YOUR_NEW_HOSTNAME bash deploy/production/bootstrap-vps.sh
```

The script creates isolated directories and a service, preserves an existing environment file and Nginx certificate configuration, and grants `github-deploy` only restart/stop rights for `everywhere-tools` plus nginx reload. It reuses existing SSH authorization without overwriting keys. The initial Nginx configuration is HTTP-only; configure a trusted certificate and HTTP-to-HTTPS redirect before sharing links. Run `nginx -t` before reloading Nginx after certificate changes. Keep Node port 3007 private.

For VPN-only hosting, change BOTH wildcard Nginx listeners in the template to the intended VPN interface before bootstrap and restrict traffic with your firewall. Use private DNS and a trusted HTTPS certificate; camera scanning on phones still needs HTTPS. GitHub-hosted runners need connectivity to the SSH endpoint; a VPN-only SSH target requires a suitably connected runner.

## GitHub production environment

Create a separate repository for this app and a `production` environment. Configure:

| Secret / variable | Value |
| --- | --- |
| Secret `PROD_SSH_KEY` | Existing authorized deployment private key |
| Secret `PROD_SSH_KNOWN_HOSTS` | Server host-key entry verified out of band |
| Secret `PROD_SSH_HOST` | Optional; defaults to `45.77.170.239` |
| Secret `PROD_SSH_USER` | Optional; defaults to `github-deploy` |
| Secret `PROD_SSH_PORT` | Optional; defaults to `22` |
| Variable `PROD_EVERYWHERE_TOOLS_URL` | Required final HTTPS origin, e.g. `https://tools.your-domain.com` |

Host verification uses the trusted known-hosts entry instead of trusting an unverified `ssh-keyscan` response. For a non-default SSH port, supply its `[hostname]:port` known-hosts entry. Verify the fingerprint via your provider console or existing trusted connection.

Workflow: **Actions → Deploy Everywhere Tools → Run workflow**. It is manual-only while the target is being prepared; pushing source does not deploy automatically. It runs lint, build, tests and shell syntax checks, uploads an allowlisted archive plus SHA-256, verifies the checksum remotely, activates the release, and checks HTTPS. Secrets are passed as environment values rather than embedded into shell source.

## Local release archive

From the project root:

```powershell
powershell -File deploy/package.ps1
```

Output: `artifacts/everywhere-tools-TIMESTAMP.tar.gz` and `.sha256`. Includes built assets, both servers, package manifests, and deployment templates. Excludes local data, credentials, logs and node_modules. Upload both files and verify with `sha256sum -c ARCHIVE.tar.gz.sha256` on Linux. Extract into a NEW directory below `/var/www/everywhere-tools/releases`, then run as the deploy user:

```bash
bash /var/www/everywhere-tools/releases/RELEASE_ID/deploy/production/activate.sh /var/www/everywhere-tools/releases/RELEASE_ID
```

Do not extract over a live release. No npm install is needed on the target.

## Verification

```bash
systemctl status everywhere-tools --no-pager
journalctl -u everywhere-tools -n 80 --no-pager
curl --fail http://127.0.0.1:3007/api/health
curl --fail https://YOUR_NEW_HOSTNAME/api/health
nginx -t
```

Open all five tools through the HTTPS hostname. Verify notes/chat on two devices, restart persistence, QR camera scanning, file comparison, and JWT/JSON decoding. Generate QR codes from the final hostname, never localhost. The health endpoint checks the process and built entry point; it is not a complete storage or end-to-end test. Linux services, firewall, Nginx, TLS and phone-camera checks remain target-server validation.

Nginx buffering and caching are disabled so Server-Sent Events arrive immediately. Its 90-second timeout exceeds the 20-second heartbeat. Access logging is disabled for this virtual host because URLs contain room codes. Configure equivalent behavior in any additional proxy.

## Smoke test troubleshooting

The GitHub workflow checks the application on the VPS first, then checks the public `/api/health` URL separately. Set the production environment variable `PROD_EVERYWHERE_TOOLS_URL` to `https://tools.flare.pet` (an existing variable overrides the workflow default).

If the public response is `403` with `cf-mitigated: challenge`, Cloudflare is serving a browser challenge that curl cannot complete. Inspect the matching Cloudflare security event and exclude only `GET`/`HEAD` requests for hostname `tools.flare.pet` and exact path `/api/health` from the challenge-producing rule. Keep protection on the other routes. Verify `curl --fail https://tools.flare.pet/api/health` returns `{"status":"ok"}`, then rerun the workflow. Switching from HTTP to HTTPS alone does not fix this challenge.

Older releases returned 404 to `curl -I /api/health` because they only supported GET. Use `curl --include http://127.0.0.1:3007/api/health` to check those releases; current code supports both GET and HEAD. A running systemd process alone does not confirm a healthy application.

## Rollback and data

`activate.sh` switches the active symlink atomically and restores the previous release if the local startup health check fails. HTTPS failures are reported separately; inspect DNS/TLS/Nginx before rolling back. To roll back manually, invoke `activate.sh` with a previous release directory. Releases are retained; remove old ones only after identifying and preserving the active and rollback targets. Future data migrations need their own restore plan.

Back up `/var/www/everywhere-tools/shared/data` before updates: stop `everywhere-tools`, archive the directory to a unique protected filename, and restart the service. Copy backups off-server. Restore only while stopped, with `www-data` ownership and writable permissions. Notes flush pending writes on a normal service stop; chat saves each accepted message.

Run one process only: the file-backed store is not multi-replica storage. Anyone with a session code can read its contents. Sessions have no automatic expiry; plan retention, backups, and abuse controls before unrestricted public exposure.

References: [Node support schedule](https://nodejs.org/en/about/previous-releases), [Nginx streaming configuration](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering).
