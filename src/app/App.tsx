import { useCallback, useState } from "react";
import { TreePane, type SessionKey, type ViewMode } from "./TreePane.js";
import { SessionView } from "./SessionView.js";
import { useIndex } from "./useIndex.js";

const DAYS_OPTIONS: { label: string; value: number | null }[] = [
  { label: "7日", value: 7 },
  { label: "30日", value: 30 },
  { label: "全期間", value: null },
];

export function App() {
  const { data, error, loading, reload } = useIndex();
  const [selection, setSelection] = useState<SessionKey | null>(null);
  const [mode, setMode] = useState<ViewMode>("project");
  const [days, setDays] = useState<number | null>(7);
  const handleSelect = useCallback((key: SessionKey | null) => setSelection(key), []);
  const handleDeleted = useCallback(() => {
    setSelection(null);
    reload();
  }, [reload]);

  return (
    <div className="layout">
      <aside className="layout-left">
        <div className="view-controls">
          <div className="segmented" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "project"}
              onClick={() => setMode("project")}
            >
              プロジェクト別
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "recent"}
              onClick={() => setMode("recent")}
            >
              時系列
            </button>
          </div>
          {mode === "recent" && (
            <select
              className="days-select"
              value={days === null ? "all" : String(days)}
              onChange={(e) => setDays(e.target.value === "all" ? null : Number(e.target.value))}
            >
              {DAYS_OPTIONS.map((o) => (
                <option key={String(o.value)} value={o.value === null ? "all" : String(o.value)}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>
        {loading && !data && <div className="pane-status">loading index…</div>}
        {error && <div className="pane-status error">error: {error}</div>}
        {data && (
          <TreePane
            key={`${mode}-${days ?? "all"}`}
            index={data}
            mode={mode}
            days={days}
            onSelect={handleSelect}
            onDeleted={handleDeleted}
          />
        )}
      </aside>
      <main className="layout-right">
        <SessionView selection={selection} />
      </main>
    </div>
  );
}
