import { firstLine, firstSentence } from "./format";
import type { Commit, Tree } from "./github";

export interface AgentInfo {
  file: string;
  name: string;
  model: string;
  effort: string;
  tools: string[];
  description: string;
}

export function parseFrontmatter(raw: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

export function parseAgent(file: string, raw: string): AgentInfo {
  const fm = parseFrontmatter(raw);
  return {
    file,
    name: fm.name || file.replace(/^.*\//, "").replace(/\.md$/, ""),
    model: (fm.model || "other").toLowerCase(),
    effort: fm.effort || "",
    tools: (fm.tools || "").split(",").map((s) => s.trim()).filter(Boolean),
    description: firstSentence(fm.description || ""),
  };
}

export type ModelGroup = "opus" | "sonnet" | "other";
export const modelGroup = (model: string): ModelGroup => (model.includes("opus") ? "opus" : model.includes("sonnet") ? "sonnet" : "other");

export function groupAgents(agents: AgentInfo[]): Record<ModelGroup, AgentInfo[]> {
  const g: Record<ModelGroup, AgentInfo[]> = { opus: [], sonnet: [], other: [] };
  for (const a of agents) g[modelGroup(a.model)].push(a);
  for (const k of Object.keys(g) as ModelGroup[]) g[k].sort((a, b) => a.name.localeCompare(b.name));
  return g;
}

export function skillDirs(tree: Tree): string[] {
  const s = new Set<string>();
  for (const e of tree.tree) {
    const m = /^\.claude\/skills\/([^/]+)(\/|$)/.exec(e.path);
    if (m && (e.type === "tree" ? e.path.split("/").length === 3 : e.path.split("/").length > 3)) s.add(m[1]);
  }
  return [...s].sort();
}

export function hookFiles(tree: Tree): string[] {
  return tree.tree.filter((e) => e.type === "blob" && /^\.claude\/hooks\/[^/]+$/.test(e.path)).map((e) => e.path.replace(/^.*\//, "")).sort();
}

export function docFiles(tree: Tree, dir: "specs" | "decisions"): string[] {
  const re = new RegExp(`^docs/${dir}/[^/]+\\.md$`);
  return tree.tree.filter((e) => e.type === "blob" && re.test(e.path) && !e.path.endsWith("/_template.md")).map((e) => e.path).sort();
}

export interface ChangeEntry {
  sha: string;
  date: string;
  title: string;
  author: string;
  url: string;
}

export function changeLog(lists: Commit[][], max = 20): ChangeEntry[] {
  const seen = new Map<string, ChangeEntry>();
  for (const list of lists)
    for (const c of list) {
      if (seen.has(c.sha)) continue;
      seen.set(c.sha, {
        sha: c.sha,
        date: c.commit.author?.date || "",
        title: firstLine(c.commit.message),
        author: c.author?.login || c.commit.author?.name || "unknown",
        url: c.html_url,
      });
    }
  return [...seen.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, max);
}
