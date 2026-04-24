import { BrowserWindow, app } from "electron";
import { readFile } from "node:fs/promises";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import { extname, join, normalize } from "node:path";

process.env.CLAUDE_CHATS_CACHE_DIR ??= join(app.getPath("userData"), "cache");

const { indexHandler, sessionHandler } = await import("../src/server/handlers.js");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  distDir: string,
): Promise<void> {
  const url = req.url ?? "/";
  const pathOnly = url.split("?")[0] ?? "/";
  const rel = pathOnly === "/" ? "/index.html" : pathOnly;
  const resolved = normalize(join(distDir, rel));
  if (!resolved.startsWith(distDir)) {
    res.statusCode = 403;
    res.end("forbidden");
    return;
  }
  try {
    const data = await readFile(resolved);
    res.setHeader("content-type", MIME[extname(resolved)] ?? "application/octet-stream");
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
}

async function startLocalServer(distDir: string): Promise<string> {
  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/api/index")) {
      void Promise.resolve(indexHandler(req, res));
      return;
    }
    if (url.startsWith("/api/session")) {
      void Promise.resolve(sessionHandler(req, res));
      return;
    }
    void serveStatic(req, res, distDir);
  });
  return await new Promise<string>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        resolve(`http://127.0.0.1:${addr.port}/`);
      } else {
        reject(new Error("failed to bind local server"));
      }
    });
  });
}

async function createWindow(): Promise<void> {
  const isDev = process.env.ELECTRON_DEV === "1";
  const url = isDev
    ? "http://localhost:5173/"
    : await startLocalServer(join(app.getAppPath(), "dist"));

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    backgroundColor: "#ffffff",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  await win.loadURL(url);
  if (isDev) win.webContents.openDevTools({ mode: "detach" });
}

void app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
