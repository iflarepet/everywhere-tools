# Everywhere Tools

A standalone React + Vite project with seven tools at `/`:

- **Notes** (`/notes`): copied from `../notes-sync-app`, including live shared notes, code sharing, QR generation, and camera scanning.
- **Chat everywhere** (`/chat`): create or join an 8-character room, invite through a link/QR code, and exchange live messages. The last 500 messages per room are saved on disk.
- **Compare text** (`/compare`): paste text or select two plain-text files (up to 1 MB each). Added and removed lines are highlighted. Large comparisons use a bounded prefix/suffix comparison. Line endings are normalized.
- **JSON beautifier** (`/json`): validate, format with 2 or 4 spaces, minify, copy, and download JSON.

- **JWT decoder** (`/jwt`): locally decode header and payload, copy JSON, and inspect UTC timestamps. Does not verify signatures or decrypt JWE tokens. Tokens are never sent to the server or saved in browser storage.

- **Text utilities** (`/text`): change case, remove duplicate/blank lines, trim lines, sort naturally, and count words/characters/lines. Processed in the browser; use a result as input to chain operations.

- **Diagram editor** (`/drawio`): Excalidraw-powered canvas with clean shape styling, bound connectors, resize/rotate, multi-select, grouping, alignment, undo/redo, grid and object snapping, zoom/pan, and flowchart/architecture/mind-map starters. Autosaves the current diagram on this device; download editable `.excalidraw` files or export the whole diagram to PNG/SVG. Imports `.excalidraw` and the previous editor’s JSON format. Legacy cylinders/parallelograms become editable rectangles with a warning. draw.io XML (`.drawio`) is not supported.

## Run locally

```sh
npm ci
npm run build
npm start
```

Open http://localhost:3010. To use another device on the same network, open this computer's LAN IP on port 3010; generate the QR from that address. A localhost QR only works on the computer displaying it. Camera scanning requires HTTPS or localhost; joining by code works without the camera.

## Development

Keep `npm start` running for the API on port 3010, then run `npm run dev` for Vite with hot reload. Vite proxies `/api` to port 3010.

```sh
npm run build
npm run lint
npm test
```

## Data and configuration

Notes are stored in `data/notes.json`; chat rooms in `data/chat.json`. No existing notes, chat records, credentials, or deployment settings are copied from the source app. Browser keys are namespaced for this project. Anyone who has a session code can access its content. Notes and chat have separate namespaces.

Optional environment variables: `HOST` (default `0.0.0.0`), `PORT` (default `3010`), `STATIC_ROOT` (default `dist`), `NOTES_FILE`, and `CHAT_FILE`. Data files belong to a single server process. If publishing later, add HTTPS and preserve SSE streaming in the reverse proxy, and configure appropriate access/rate limits and backups.

Text comparison and JSON formatting happen only in the browser; selected comparison files are not uploaded. JSON formatting uses JavaScript's JSON parser, so integers beyond JavaScript's safe numeric range can lose precision.

## Production deployment

See [the deployment guide](deploy/production/README.md). This follows notes-sync-app’s VPS release pattern with a separate service, directory, and port. Use `powershell -File deploy/package.ps1` to build a checked release archive. Deployment is manual via `.github/workflows/production-deploy.yml`; no server changes are made by local packaging.

## Diagram editor development

The editor is lazy-loaded so other tools do not download its bundle. `predev` and `prebuild` copy installed Excalidraw fonts to `public/excalidraw/fonts`; these generated assets are ignored by Git and included in the production build. No external iframe is needed. The current scene, embedded images, and title are stored under `everywhere-diagram-v1` in localStorage. Storage failures are shown in the status bar; editable downloads remain available. Autosave is device-local, not shared notes/chat synchronization. Use Download editable to keep multiple documents or a backup. Starter diagrams append to existing content, and replacing/clearing a scene can be undone.
