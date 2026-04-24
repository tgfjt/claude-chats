import { useEffect, useState } from "react";
import type { SessionEntry, SessionResponse } from "../types.js";
import type { SessionKey } from "./TreePane.js";

type Props = { selection: SessionKey | null };

export function SessionView({ selection }: Props) {
  const [entries, setEntries] = useState<SessionEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selection) {
      setEntries(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const params = new URLSearchParams({ project: selection.project, id: selection.id });
        const res = await fetch(`/api/session?${params.toString()}`);
        if (!res.ok) throw new Error(`session: ${res.status}`);
        const json = (await res.json()) as SessionResponse;
        if (!cancelled) setEntries(json.entries);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selection]);

  if (!selection) {
    return <div className="session-empty">左のツリーからセッションを選択してください</div>;
  }
  if (loading && !entries) return <div className="session-empty">読み込み中…</div>;
  if (error) return <div className="session-error">error: {error}</div>;
  if (!entries) return null;

  return (
    <div className="session-list">
      {entries.map((entry, i) => (
        <EntryRow key={i} entry={entry} />
      ))}
    </div>
  );
}

function EntryRow({ entry }: { entry: SessionEntry }) {
  const time = entry.ts ? new Date(entry.ts).toLocaleString() : "";
  switch (entry.kind) {
    case "user":
    case "assistant":
    case "system":
      return (
        <article className={`entry entry-${entry.kind}`}>
          <header>
            <span className="entry-kind">{entry.kind}</span>
            <span className="entry-ts">{time}</span>
          </header>
          <pre>{entry.text}</pre>
        </article>
      );
    case "tool_use":
      return (
        <article className="entry entry-tool_use">
          <header>
            <span className="entry-kind">tool_use</span>
            <span className="entry-tool-name">{entry.name}</span>
            <span className="entry-ts">{time}</span>
          </header>
          <pre>{JSON.stringify(entry.input, null, 2)}</pre>
        </article>
      );
    case "tool_result":
      return (
        <article className="entry entry-tool_result">
          <header>
            <span className="entry-kind">tool_result</span>
            <span className="entry-ts">{time}</span>
          </header>
          <pre>{entry.text}</pre>
        </article>
      );
  }
}
