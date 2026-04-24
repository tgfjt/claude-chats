import { access, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import type { Connect, Plugin, PreviewServer, ViteDevServer } from "vite";
import { scanIndex, resolveSessionFile } from "./scan.js";
import { readSession } from "./session.js";
import type { IndexResponse, SessionResponse } from "../types.js";

const TRASH_DIR = join(homedir(), ".Trash");

async function moveToTrash(filePath: string): Promise<string> {
  const ext = extname(filePath);
  const stem = basename(filePath, ext);
  let dest = join(TRASH_DIR, `${stem}${ext}`);
  let i = 1;
  while (true) {
    try {
      await access(dest);
      dest = join(TRASH_DIR, `${stem} ${i}${ext}`);
      i += 1;
    } catch {
      break;
    }
  }
  await rename(filePath, dest);
  return dest;
}

function sendJson(
  res: Parameters<Connect.NextHandleFunction>[1],
  status: number,
  body: unknown,
): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

const indexHandler: Connect.NextHandleFunction = async (_req, res) => {
  try {
    const projects = await scanIndex();
    const body: IndexResponse = { projects };
    sendJson(res, 200, body);
  } catch (error) {
    sendJson(res, 500, { error: (error as Error).message });
  }
};

const sessionHandler: Connect.NextHandleFunction = async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://local");
    const project = url.searchParams.get("project");
    const id = url.searchParams.get("id");
    if (!project || !id) {
      sendJson(res, 400, { error: "project and id are required" });
      return;
    }
    const file = resolveSessionFile(project, id);
    if (req.method === "DELETE") {
      const trashed = await moveToTrash(file);
      sendJson(res, 200, { ok: true, trashed });
      return;
    }
    const entries = await readSession(file);
    const body: SessionResponse = { project, id, entries };
    sendJson(res, 200, body);
  } catch (error) {
    sendJson(res, 500, { error: (error as Error).message });
  }
};

function attach(server: ViteDevServer | PreviewServer): void {
  server.middlewares.use("/api/index", indexHandler);
  server.middlewares.use("/api/session", sessionHandler);
}

export function claudeChatsApi(): Plugin {
  return {
    name: "claude-chats-api",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
