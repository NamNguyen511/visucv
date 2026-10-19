// Per-viewer learning progress, kept in this browser only. Storage can be missing or throw
// (private windows, blocked site data), so every access is guarded and failure means "no progress".
const KEY = "visucv:progress";
export type Progress = { visited: string[]; last?: string };

export function readProgress(): Progress {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null");
    // Stored data may be hand-edited or stale: keep only string ids.
    const visited = Array.isArray(p?.visited) ? p.visited.filter((v: unknown) => typeof v === "string") : [];
    return typeof p?.last === "string" ? { visited, last: p.last } : { visited };
  } catch {
    return { visited: [] };
  }
}

export function markVisited(id: string) {
  try {
    const p = readProgress();
    localStorage.setItem(KEY, JSON.stringify({ visited: [...new Set([...p.visited, id])], last: id }));
  } catch { /* no storage: nothing to remember */ }
}
