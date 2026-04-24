import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ContextMenuItem, ContextMenuOpenContext } from "@pierre/trees";
import { FileTree, useFileTree, useFileTreeSelection } from "@pierre/trees/react";
import type { IndexResponse } from "../types.js";

export type SessionKey = { project: string; id: string };
export type ViewMode = "project" | "recent";

type Props = {
  index: IndexResponse;
  mode: ViewMode;
  days: number | null;
  onSelect: (key: SessionKey | null) => void;
  onDeleted: () => void;
};

type FlatSession = {
  projectSlug: string;
  projectBase: string;
  id: string;
  topic: string;
  mtime: number;
  pathSegment: string;
};

const SANITIZE = /[/\\\n\r\t]+/g;
function sanitize(s: string): string {
  return s.replace(SANITIZE, " ").replace(/\s+/g, " ").trim();
}

function dayLabel(mtime: number, now: number): string {
  const mDate = new Date(mtime);
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.floor((midnight(new Date(now)) - midnight(mDate)) / 86_400_000);
  if (diff <= 0) return "今日";
  if (diff === 1) return "昨日";
  const iso = `${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, "0")}-${String(mDate.getDate()).padStart(2, "0")}`;
  const dow = ["日", "月", "火", "水", "木", "金", "土"][mDate.getDay()];
  return `${iso} (${dow})`;
}

function flatten(index: IndexResponse): FlatSession[] {
  const out: FlatSession[] = [];
  for (const project of index.projects) {
    for (const session of project.sessions) {
      out.push({
        projectSlug: project.slug,
        projectBase: project.basename,
        id: session.id,
        topic: session.topic,
        mtime: session.mtime,
        pathSegment: session.pathSegment,
      });
    }
  }
  return out;
}

function buildProject(sessions: FlatSession[]): {
  paths: string[];
  byPath: Map<string, SessionKey>;
  mtimeByPath: Map<string, number>;
} {
  const paths: string[] = [];
  const byPath = new Map<string, SessionKey>();
  const mtimeByPath = new Map<string, number>();
  for (const s of sessions) {
    const path = `${s.projectBase}/${s.pathSegment}`;
    paths.push(path);
    byPath.set(path, { project: s.projectSlug, id: s.id });
    mtimeByPath.set(path, s.mtime);
    const prev = mtimeByPath.get(s.projectBase) ?? 0;
    if (s.mtime > prev) mtimeByPath.set(s.projectBase, s.mtime);
  }
  return { paths, byPath, mtimeByPath };
}

function buildRecent(
  sessions: FlatSession[],
  days: number | null,
): {
  paths: string[];
  byPath: Map<string, SessionKey>;
  mtimeByPath: Map<string, number>;
} {
  const now = Date.now();
  const cutoff = days === null ? 0 : now - days * 86_400_000;
  const filtered = sessions.filter((s) => s.mtime >= cutoff);
  filtered.sort((a, b) => b.mtime - a.mtime);

  const paths: string[] = [];
  const byPath = new Map<string, SessionKey>();
  const mtimeByPath = new Map<string, number>();
  for (const s of filtered) {
    const group = dayLabel(s.mtime, now);
    const shortId = s.id.slice(0, 8);
    const topic = sanitize(s.topic) || "(untitled)";
    const leaf = `${s.projectBase.replace(/\//g, " · ")} · ${topic} · ${shortId}.jsonl`;
    const path = `${group}/${leaf}`;
    paths.push(path);
    byPath.set(path, { project: s.projectSlug, id: s.id });
    mtimeByPath.set(path, s.mtime);
    if (!mtimeByPath.has(group)) mtimeByPath.set(group, s.mtime);
  }
  return { paths, byPath, mtimeByPath };
}

export function TreePane({ index, mode, days, onSelect, onDeleted }: Props) {
  const { paths, byPath, mtimeByPath } = useMemo(() => {
    const flat = flatten(index);
    return mode === "recent" ? buildRecent(flat, days) : buildProject(flat);
  }, [index, mode, days]);

  const sort = useMemo(() => {
    if (mode !== "recent") return "default" as const;
    return (a: { path: string }, b: { path: string }) => {
      const am = mtimeByPath.get(a.path) ?? 0;
      const bm = mtimeByPath.get(b.path) ?? 0;
      return bm - am;
    };
  }, [mode, mtimeByPath]);

  const { model } = useFileTree({
    paths,
    initialExpansion: mode === "recent" ? "open" : "closed",
    sort,
    search: true,
  });

  const selection = useFileTreeSelection(model);
  const current = selection[0];
  const resolved = useMemo(
    () => (current ? (byPath.get(current) ?? null) : null),
    [current, byPath],
  );

  const prevKey = useRef<string | null>(null);
  useEffect(() => {
    const key = resolved ? `${resolved.project}::${resolved.id}` : null;
    if (prevKey.current === key) return;
    prevKey.current = key;
    onSelect(resolved);
  }, [resolved, onSelect]);

  const renderContextMenu = useCallback(
    (item: ContextMenuItem, context: ContextMenuOpenContext) => {
      if (item.kind !== "file") return null;
      const key = byPath.get(item.path);
      if (!key) return null;
      const onDelete = async () => {
        context.close();
        if (!window.confirm(`ゴミ箱に入れる？\n\n${item.name}`)) return;
        const params = new URLSearchParams({ project: key.project, id: key.id });
        const res = await fetch(`/api/session?${params.toString()}`, { method: "DELETE" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
            error?: string;
          };
          window.alert(`削除失敗: ${body.error ?? res.status}`);
          return;
        }
        model.remove(item.path);
        onDeleted();
      };
      return (
        <div className="ctx-menu" role="menu">
          <button type="button" role="menuitem" onClick={onDelete}>
            ゴミ箱に入れる
          </button>
        </div>
      );
    },
    [byPath, model, onDeleted],
  );

  return <FileTree model={model} className="tree-pane" renderContextMenu={renderContextMenu} />;
}
