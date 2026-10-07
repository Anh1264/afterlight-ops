import { isCounted } from "./chains";
import type { Pull, Run } from "./github";

export type CiState = "ready" | "failing" | "running" | "none";
export interface OpenPr {
  pr: Pull;
  ci: CiState;
  run: Run | null;
}

export function ciFor(pr: Pull, runs: Run[]): { ci: CiState; run: Run | null } {
  const mine = runs.filter((r) => r.head_sha === pr.head.sha).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const latest = mine[0] ?? null;
  if (!latest) return { ci: "none", run: null };
  if (latest.status !== "completed") return { ci: "running", run: latest };
  if (latest.conclusion === "success") return { ci: "ready", run: latest };
  if (latest.conclusion === "failure" || latest.conclusion === "timed_out") return { ci: "failing", run: latest };
  // cancelled/skipped: fall back to the latest decisive run, else treat as none
  const decisive = mine.find(isCounted);
  if (decisive) return { ci: decisive.conclusion === "success" ? "ready" : "failing", run: decisive };
  return { ci: "none", run: latest };
}

const ORDER: Record<CiState, number> = { ready: 0, running: 1, failing: 2, none: 3 };

export function openPrs(pulls: Pull[], runs: Run[]): OpenPr[] {
  return pulls
    .filter((p) => p.state === "open")
    .map((pr) => ({ pr, ...ciFor(pr, runs) }))
    .sort((a, b) => ORDER[a.ci] - ORDER[b.ci] || Date.parse(b.pr.updated_at) - Date.parse(a.pr.updated_at));
}

export function latestMainRun(runs: Run[]): Run | null {
  const main = runs.filter((r) => r.head_branch === "main" && r.status === "completed" && isCounted(r));
  main.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return main[0] ?? null;
}

export const merged = (pulls: Pull[], n = 15) =>
  pulls.filter((p) => p.merged_at).sort((a, b) => Date.parse(b.merged_at ?? "") - Date.parse(a.merged_at ?? "")).slice(0, n);
export const closedUnmerged = (pulls: Pull[], n = 5) =>
  pulls.filter((p) => p.state === "closed" && !p.merged_at).sort((a, b) => Date.parse(b.closed_at ?? "") - Date.parse(a.closed_at ?? "")).slice(0, n);

export type PrKind = "feat" | "fix" | "chore" | "test" | "docs" | "other";
export const PR_KINDS: PrKind[] = ["feat", "fix", "chore", "test", "docs", "other"];
/** Kind from the conventional-commit prefix of the PR title; anything else is "other". */
export function prKind(title: string): PrKind {
  const m = /^(feat|fix|chore|test|docs)(\([^)]*\))?!?:/i.exec(title.trim());
  return m ? (m[1].toLowerCase() as PrKind) : "other";
}
