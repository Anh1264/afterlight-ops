import { stripMd } from "./format";

export type Status = "todo" | "spec" | "building" | "review" | "done" | "other";
export const STATUSES: Status[] = ["done", "review", "building", "spec", "todo", "other"];

export interface BacklogItem {
  id: string;
  area: string;
  size: string;
  text: string;
  status: Status;
  statusRaw: string;
}
export interface PrRow {
  pr: string;
  items: string;
  status: Status;
  statusRaw: string;
}
export interface BacklogSection {
  name: string;
  intro: string;
  items: BacklogItem[];
  prs: PrRow[];
}

export function parseStatus(cell: string): Status {
  const m = /^\W*(todo|spec|building|review|done)\b/i.exec(stripMd(cell));
  return m ? (m[1].toLowerCase() as Status) : "other";
}

/** Splits a markdown table row on unescaped pipes. */
export function splitRow(line: string): string[] {
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return body.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim());
}

const isSeparator = (cells: string[]) => cells.every((c) => /^:?-{2,}:?$/.test(c));

export function parseBacklog(md: string): BacklogSection[] {
  const sections: BacklogSection[] = [];
  let cur: BacklogSection | null = null;
  let mode: "item" | "pr" | null = null;
  let introDone = false;

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h = /^##\s+(.+)$/.exec(line);
    if (h) {
      cur = { name: stripMd(h[1]), intro: "", items: [], prs: [] };
      sections.push(cur);
      mode = null;
      introDone = false;
      continue;
    }
    if (!cur) continue;
    if (!line.trimStart().startsWith("|")) {
      mode = null;
      if (!introDone && line.trim() && !line.startsWith("#")) {
        cur.intro = stripMd(line);
        introDone = true;
      }
      continue;
    }
    const cells = splitRow(line);
    if (isSeparator(cells)) continue;
    const head = cells[0].toLowerCase();
    if (head === "id" && cells.length >= 5) {
      mode = "item";
      continue;
    }
    if (head === "pr" && cells.length >= 3) {
      mode = "pr";
      continue;
    }
    if (mode === "item" && cells.length >= 5) {
      const [id, area, size, ...rest] = cells;
      const statusRaw = rest[rest.length - 1];
      const text = rest.slice(0, -1).join(" | ");
      cur.items.push({ id: stripMd(id), area: stripMd(area), size: stripMd(size), text: stripMd(text), status: parseStatus(statusRaw), statusRaw: stripMd(statusRaw) });
    } else if (mode === "pr" && cells.length >= 3) {
      cur.prs.push({ pr: stripMd(cells[0]), items: stripMd(cells[1]), status: parseStatus(cells[2]), statusRaw: stripMd(cells[2]) });
    }
  }
  return sections.filter((s) => s.items.length > 0 || s.prs.length > 0);
}

export function countByStatus(items: { status: Status }[]): Record<Status, number> {
  const c: Record<Status, number> = { todo: 0, spec: 0, building: 0, review: 0, done: 0, other: 0 };
  for (const i of items) c[i.status]++;
  return c;
}
