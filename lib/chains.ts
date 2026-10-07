import { dayKey, firstLine, median } from "./format";
import type { Run } from "./github";

export interface Failure {
  run: Run;
  branch: string;
  prNumber: number | null;
  fixedBy: Run | null;
  /** ms from this failure to the next success on the same branch */
  timeToFix: number | null;
}

export interface PipelineStats {
  counted: number;
  passes: number;
  failures: number;
  passRate: number | null;
  stillFailing: number;
  medianTimeToFix: number | null;
  failureList: Failure[];
}

const FAIL = new Set(["failure", "timed_out"]);
export const isFail = (r: Run) => r.conclusion !== null && FAIL.has(r.conclusion);
export const isPass = (r: Run) => r.conclusion === "success";
/** Cancelled, skipped, neutral and in-progress runs are ignored in rates. */
export const isCounted = (r: Run) => isFail(r) || isPass(r);

const t = (r: Run) => Date.parse(r.created_at);

export function buildChains(runs: Run[]): PipelineStats {
  const byBranch = new Map<string, Run[]>();
  for (const r of runs) {
    if (!isCounted(r)) continue;
    const k = r.head_branch ?? "(unknown)";
    const arr = byBranch.get(k);
    if (arr) arr.push(r);
    else byBranch.set(k, [r]);
  }

  const failureList: Failure[] = [];
  const streakFixTimes: number[] = [];
  let stillFailing = 0;

  for (const [branch, list] of byBranch) {
    list.sort((a, b) => t(a) - t(b));
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (!isFail(r)) continue;
      const fix = list.slice(i + 1).find(isPass) ?? null;
      failureList.push({
        run: r,
        branch,
        prNumber: r.pull_requests?.[0]?.number ?? null,
        fixedBy: fix,
        timeToFix: fix ? t(fix) - t(r) : null,
      });
      const startsStreak = i === 0 || !isFail(list[i - 1]);
      if (startsStreak) {
        if (fix) streakFixTimes.push(t(fix) - t(r));
        else stillFailing++;
      }
    }
  }

  failureList.sort((a, b) => t(b.run) - t(a.run));
  const counted = runs.filter(isCounted);
  const passes = counted.filter(isPass).length;
  return {
    counted: counted.length,
    passes,
    failures: counted.length - passes,
    passRate: counted.length ? passes / counted.length : null,
    stillFailing,
    medianTimeToFix: median(streakFixTimes),
    failureList,
  };
}

export interface DayBucket {
  key: string;
  pass: number;
  fail: number;
}

export function dailyBuckets(runs: Run[], now: number, days = 14): DayBucket[] {
  const out: DayBucket[] = [];
  for (let i = days - 1; i >= 0; i--) out.push({ key: dayKey(now - i * 86400000), pass: 0, fail: 0 });
  const idx = new Map(out.map((b, i) => [b.key, i]));
  for (const r of runs) {
    if (!isCounted(r)) continue;
    const i = idx.get(dayKey(t(r)));
    if (i === undefined) continue;
    if (isPass(r)) out[i].pass++;
    else out[i].fail++;
  }
  return out;
}

export function fixLabel(run: Run): string {
  return firstLine(run.head_commit?.message) || run.display_title || run.name || "";
}
