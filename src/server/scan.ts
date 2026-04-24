import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename as pathBasename, dirname, join } from "node:path";
import { readSessionMeta } from "./topic.js";
import type { ProjectSummary, SessionSummary } from "../types.js";

const PROJECTS_ROOT = process.env.CLAUDE_PROJECTS_ROOT ?? join(homedir(), ".claude", "projects");
const CACHE_FILE = join(process.cwd(), "node_modules", ".cache", "claude-chats", "topics.json");

type CacheEntry = { topic: string; cwd: string | null; mtime: number; size: number };
type Cache = Record<string, CacheEntry>;

let cache: Cache | null = null;

async function loadCache(): Promise<Cache> {
  if (cache) return cache;
  try {
    const raw = await readFile(CACHE_FILE, "utf8");
    cache = JSON.parse(raw) as Cache;
  } catch {
    cache = {};
  }
  return cache;
}

async function saveCache(next: Cache): Promise<void> {
  cache = next;
  await mkdir(dirname(CACHE_FILE), { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(next), "utf8");
}

const SANITIZE = /[/\\\n\r\t]+/g;
function sanitizeSegment(value: string): string {
  return value.replace(SANITIZE, " ").replace(/\s+/g, " ").trim();
}

function labelFromCwd(cwd: string | null, slug: string): { label: string; basename: string } {
  if (!cwd || cwd.length === 0) return { label: slug, basename: slug };
  const leaf = pathBasename(cwd);
  const parent = pathBasename(dirname(cwd));
  const basename = parent && parent !== "." && parent !== "/" ? `${parent}/${leaf}` : leaf;
  return { label: cwd, basename };
}

export async function scanIndex(): Promise<ProjectSummary[]> {
  const store = await loadCache();
  const nextCache: Cache = {};

  let projectDirs: string[];
  try {
    projectDirs = await readdir(PROJECTS_ROOT);
  } catch {
    return [];
  }

  const results: ProjectSummary[] = [];
  for (const slug of projectDirs) {
    if (slug.startsWith(".")) continue;
    const dir = join(PROJECTS_ROOT, slug);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    const sessionFiles = entries.filter((f) => f.endsWith(".jsonl"));
    if (sessionFiles.length === 0) continue;

    const sessions: SessionSummary[] = [];
    let projectCwd: string | null = null;
    for (const file of sessionFiles) {
      const id = file.replace(/\.jsonl$/, "");
      const full = join(dir, file);
      let st;
      try {
        st = await stat(full);
      } catch {
        continue;
      }
      const mtime = st.mtimeMs;
      const size = st.size;
      const prev = store[full];
      let topic: string;
      let cwd: string | null;
      if (prev && prev.mtime === mtime && prev.size === size && "cwd" in prev) {
        topic = prev.topic;
        cwd = prev.cwd;
      } else {
        const meta = await readSessionMeta(full);
        topic = meta.topic ?? "(no prompt found)";
        cwd = meta.cwd;
      }
      nextCache[full] = { topic, cwd, mtime, size };
      sessions.push({ id, topic, mtime, pathSegment: "" });
      if (!projectCwd && cwd) projectCwd = cwd;
    }

    sessions.sort((a, b) => b.mtime - a.mtime);
    const { label, basename } = labelFromCwd(projectCwd, slug);
    results.push({ slug, label, basename, sessions });
  }

  for (const project of results) {
    for (const session of project.sessions) {
      const shortId = session.id.slice(0, 8);
      const safeTopic = sanitizeSegment(session.topic) || "(untitled)";
      session.pathSegment = `${safeTopic} · ${shortId}.jsonl`;
    }
  }

  results.sort((a, b) => a.basename.localeCompare(b.basename));
  await saveCache(nextCache);
  return results;
}

export function resolveSessionFile(projectSlug: string, sessionId: string): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(projectSlug)) throw new Error("invalid project slug");
  if (!/^[A-Za-z0-9-]+$/.test(sessionId)) throw new Error("invalid session id");
  return join(PROJECTS_ROOT, projectSlug, `${sessionId}.jsonl`);
}
