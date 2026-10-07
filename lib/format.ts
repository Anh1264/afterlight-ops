const TZ = "America/Los_Angeles";

export function relTime(iso: string | null | undefined, now: number): string {
  if (!iso) return "n/a";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "n/a";
  return relMs(now - t) + (now - t >= 0 ? " ago" : "");
}

export function relMs(ms: number): string {
  const s = Math.abs(ms) / 1000;
  if (s < 60) return `${Math.floor(s)}s`;
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m`;
  const h = m / 60;
  if (h < 48) return `${Math.floor(h)}h`;
  const d = h / 24;
  if (d < 60) return `${Math.floor(d)}d`;
  return `${Math.floor(d / 30)}mo`;
}

/** Duration like "1h 12m" for time-to-fix values. */
export function durMs(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function fmtLA(ms: number): string {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(ms) + " PT"
  );
}

export function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" }).format(Date.parse(iso));
}

/** YYYY-MM-DD in Los Angeles time. */
export function dayKey(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

export function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + "…";
}

/** Drops markdown links ([x](u) -> x), backticks, emphasis markers. */
export function stripMd(s: string): string {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`+/g, "")
    .replace(/(\*\*|__)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstLine(s: string | null | undefined): string {
  return (s ?? "").split("\n")[0].trim();
}

export function firstSentence(s: string): string {
  const m = /^(.+?[.!?])(\s|$)/.exec(s.trim());
  return m ? m[1] : s.trim();
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const a = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

export function prettyName(file: string): string {
  const base = file.replace(/^.*\//, "").replace(/\.md$/, "");
  const m = /^(\d{4})-(.+)$/.exec(base);
  const words = (m ? m[2] : base).replace(/[-_]+/g, " ");
  const cap = words.charAt(0).toUpperCase() + words.slice(1);
  return m ? `${m[1]} ${cap}` : cap;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The last n Los Angeles calendar days as YYYY-MM-DD, oldest first, DST-safe. */
export function lastDays(now: number, n = 14): string[] {
  const [y, m, d] = dayKey(now).split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(base - i * 86400000).toISOString().slice(0, 10));
  return out;
}

/** "2026-10-07" -> { day: "7", mon: "Oct" } */
export function dayParts(key: string): { day: string; mon: string } {
  return { day: String(Number(key.slice(8))), mon: MONTHS[Number(key.slice(5, 7)) - 1] };
}

/** "Oct 7, 12:55 PM" in Los Angeles time. */
export function fmtDayTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(Date.parse(iso));
}
