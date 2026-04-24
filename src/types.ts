export type SessionSummary = {
  id: string;
  topic: string;
  mtime: number;
  pathSegment: string;
};

export type ProjectSummary = {
  slug: string;
  label: string;
  basename: string;
  sessions: SessionSummary[];
};

export type IndexResponse = {
  projects: ProjectSummary[];
};

export type SessionEntry =
  | { kind: "user"; ts: string; text: string }
  | { kind: "assistant"; ts: string; text: string }
  | { kind: "tool_use"; ts: string; name: string; input: unknown }
  | { kind: "tool_result"; ts: string; text: string }
  | { kind: "system"; ts: string; text: string };

export type SessionResponse = {
  project: string;
  id: string;
  entries: SessionEntry[];
};
