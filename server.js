import { handleChat } from "./chat-server.js";
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";

const port = Number(process.env.PORT || 3010);
const host = process.env.HOST || "0.0.0.0";
const root = resolve(process.env.STATIC_ROOT || "dist");
const notesFile = resolve(process.env.NOTES_FILE || "data/notes.json");
const indexFile = join(root, "index.html");
const maxNoteBytes = 1024 * 1024;
const codePattern = /^[A-HJ-NP-Z2-9]{8}$/;
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const subscribers = new Map();

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function loadNotes() {
  try {
    return new Map(Object.entries(JSON.parse(readFileSync(notesFile, "utf8"))));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return new Map();
  }
}

const notes = loadNotes();
let persistTimer;

function persistNotes() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      mkdirSync(dirname(notesFile), { recursive: true });
      const temporaryFile = `${notesFile}.tmp`;
      writeFileSync(temporaryFile, JSON.stringify(Object.fromEntries(notes)), "utf8");
      renameSync(temporaryFile, notesFile);
    } catch (error) {
      console.error("Could not persist notes:", error);
    }
  }, 100);
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

function sendFile(response, filePath) {
  const contentType = contentTypes.get(extname(filePath)) || "application/octet-stream";
  response.writeHead(200, {
    "content-type": contentType,
    "x-content-type-options": "nosniff",
  });
  createReadStream(filePath).pipe(response);
}

function resolveRequestPath(url) {
  const pathname = decodeURIComponent(new URL(url || "/", "http://localhost").pathname);
  const candidate = normalize(join(root, pathname));
  if (candidate !== root && !candidate.startsWith(root + sep)) return undefined;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return indexFile;
}

function generateCode() {
  let code;
  do {
    const bytes = randomBytes(8);
    code = Array.from(bytes, (byte) => codeAlphabet[byte % codeAlphabet.length]).join("");
  } while (notes.has(code));
  return code;
}

function noteFor(code) {
  return notes.get(code) || { content: "", revision: 0, updatedAt: null };
}

function broadcast(code, note) {
  const message = `data: ${JSON.stringify(note)}\n\n`;
  for (const response of subscribers.get(code) || []) response.write(message);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxNoteBytes) throw new Error("PAYLOAD_TOO_LARGE");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function handleApi(request, response, pathname) {
  if (request.method === "POST" && pathname === "/api/sessions") {
    const code = generateCode();
    notes.set(code, noteFor(code));
    persistNotes();
    sendJson(response, 201, { code, ...noteFor(code) });
    return true;
  }

  const match = pathname.match(/^\/api\/notes\/([^/]+)(\/events)?$/);
  if (!match) return false;
  const code = decodeURIComponent(match[1]).toUpperCase();
  if (!codePattern.test(code)) {
    sendJson(response, 400, { error: "Invalid sync code" });
    return true;
  }

  if (request.method === "GET" && match[2] === "/events") {
    response.writeHead(200, {
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    });
    response.write(`data: ${JSON.stringify(noteFor(code))}\n\n`);
    const codeSubscribers = subscribers.get(code) || new Set();
    codeSubscribers.add(response);
    subscribers.set(code, codeSubscribers);
    const keepAlive = setInterval(() => response.write(": keep-alive\n\n"), 20000);
    request.on("close", () => {
      clearInterval(keepAlive);
      codeSubscribers.delete(response);
      if (codeSubscribers.size === 0) subscribers.delete(code);
    });
    return true;
  }

  if (request.method === "GET" && !match[2]) {
    sendJson(response, 200, noteFor(code));
    return true;
  }

  if (request.method === "PUT" && !match[2]) {
    try {
      const body = await readJson(request);
      if (typeof body.content !== "string") {
        sendJson(response, 400, { error: "Content must be a string" });
        return true;
      }
      const current = noteFor(code);
      const note = {
        content: body.content,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
        clientId: typeof body.clientId === "string" ? body.clientId.slice(0, 100) : undefined,
      };
      notes.set(code, note);
      persistNotes();
      broadcast(code, note);
      sendJson(response, 200, note);
    } catch (error) {
      sendJson(response, error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400, {
        error: error.message === "PAYLOAD_TOO_LARGE" ? "Note is too large" : "Invalid JSON",
      });
    }
    return true;
  }

  sendJson(response, 405, { error: "Method not allowed" });
  return true;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", "http://localhost");
  if (url.pathname === "/api/health" && request.method === "GET") { sendJson(response, existsSync(indexFile) ? 200 : 503, { status: existsSync(indexFile) ? "ok" : "missing-build" }); return; }
  if (await handleChat(request, response, url.pathname)) return;
  if (await handleApi(request, response, url.pathname)) return;
  if (url.pathname.startsWith("/api/")) { sendJson(response, 404, { error: "Not found" }); return; }

  let filePath;
  try { filePath = resolveRequestPath(request.url); } catch { sendJson(response, 400, { error: "Invalid path" }); return; }
  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  sendFile(response, filePath);
}).listen(port, host, () => {
  console.log(`everywhere-tools listening on http://${host}:${server.address().port}`);
});

function shutdown() {
  clearTimeout(persistTimer);
  try {
    mkdirSync(dirname(notesFile), { recursive: true });
    writeFileSync(`${notesFile}.tmp`, JSON.stringify(Object.fromEntries(notes)), "utf8");
    renameSync(`${notesFile}.tmp`, notesFile);
  } catch (error) { console.error("Could not flush notes during shutdown:", error); process.exit(1); }
  server.close();
  process.exit(0);
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
