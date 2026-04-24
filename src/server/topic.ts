import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const COMMAND_WRAPPER = /^<(command-[a-z-]+|local-command-[a-z-]+)>[\s\S]*?<\/\1>\s*/;
const MAX_LEN = 80;

export type TopicPick = {
  topic: string;
  text: string;
};

export function extractTopicFromEntry(entry: unknown): TopicPick | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  if (e.type !== "user") return null;
  if (e.isSidechain === true) return null;
  if ("toolUseResult" in e) return null;
  if ("attachment" in e) return null;

  const data = (e.data ?? e) as Record<string, unknown>;
  const message = data.message as Record<string, unknown> | undefined;
  if (!message) return null;
  const content = message.content;

  let text: string | null = null;
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content) && content.length > 0) {
    const first = content[0] as Record<string, unknown> | undefined;
    if (first?.type === "text" && typeof first.text === "string") {
      text = first.text;
    }
  }
  if (text === null) return null;

  let stripped = text;
  while (true) {
    const next = stripped.replace(COMMAND_WRAPPER, "").trimStart();
    if (next === stripped) break;
    stripped = next;
  }
  if (stripped.length === 0) return null;
  if (stripped.startsWith("<command-") || stripped.startsWith("<local-command-")) return null;

  const collapsed = stripped.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return null;

  const topic = collapsed.length > MAX_LEN ? `${collapsed.slice(0, MAX_LEN - 1)}…` : collapsed;
  return { topic, text: collapsed };
}

export type SessionMeta = {
  topic: string | null;
  cwd: string | null;
};

export async function readSessionMeta(filePath: string): Promise<SessionMeta> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let topic: string | null = null;
  let cwd: string | null = null;
  try {
    for await (const line of rl) {
      if (!line) continue;
      let entry: unknown;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (cwd === null && entry && typeof entry === "object") {
        const c = (entry as Record<string, unknown>).cwd;
        if (typeof c === "string" && c.length > 0) cwd = c;
      }
      if (topic === null) {
        const picked = extractTopicFromEntry(entry);
        if (picked) topic = picked.topic;
      }
      if (topic !== null && cwd !== null) break;
    }
  } finally {
    rl.close();
    stream.destroy();
  }
  return { topic, cwd };
}
