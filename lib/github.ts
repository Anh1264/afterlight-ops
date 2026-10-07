import { readFile } from "node:fs/promises";
import path from "node:path";
import { prettyName } from "./format";
import { docFiles, docTitle, parseSkill, skillDirs, type SkillInfo } from "./team";

export const REPO = process.env.REPO || "Anh1264/afterlight";
const FIXTURE = process.env.DATA_SOURCE === "fixture";
const LOCAL_REPO = process.env.LOCAL_REPO || "";
const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
const TIMEOUT_MS = 10000;

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface Pull {
  number: number;
  title: string;
  state: string;
  draft?: boolean;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  user?: { login: string } | null;
  head: { ref: string; sha: string };
}
export interface Run {
  id: number;
  name: string | null;
  head_branch: string | null;
  head_sha: string;
  event: string;
  status: string | null;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  display_title?: string;
  head_commit?: { message?: string } | null;
  pull_requests?: { number: number }[] | null;
}
export interface Commit {
  sha: string;
  html_url: string;
  commit: { message: string; author?: { name?: string; date?: string } | null };
  author?: { login?: string } | null;
  parents?: { sha: string }[];
}
export interface TreeEntry {
  path: string;
  type: string;
}
export interface Tree {
  tree: TreeEntry[];
  truncated?: boolean;
}

export interface Agent {
  path: string;
  raw: string;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function httpError(what: string, status: number): string {
  const hint = status === 403 || status === 429 ? " (rate limited? set GITHUB_TOKEN)" : "";
  return `${what}: HTTP ${status}${hint}`;
}

async function api<T>(what: string, apiPath: string, fixtureFile: string): Promise<Result<T>> {
  try {
    if (FIXTURE) {
      const txt = await readFile(path.join(process.cwd(), "fixtures", fixtureFile), "utf8");
      return { ok: true, data: JSON.parse(txt) as T };
    }
    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "afterlight-ops" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(`${API}/repos/${REPO}${apiPath}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), next: { revalidate: 300 } });
    if (!res.ok) return { ok: false, error: httpError(what, res.status) };
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    return { ok: false, error: `${what}: ${errMsg(e)}` };
  }
}

export async function rawFile(what: string, filePath: string): Promise<Result<string>> {
  try {
    if (FIXTURE) {
      if (!LOCAL_REPO) return { ok: false, error: `${what}: LOCAL_REPO not set` };
      return { ok: true, data: await readFile(path.join(LOCAL_REPO, filePath), "utf8") };
    }
    const res = await fetch(`${RAW}/${REPO}/main/${filePath}`, { signal: AbortSignal.timeout(TIMEOUT_MS), next: { revalidate: 300 } });
    if (!res.ok) return { ok: false, error: httpError(what, res.status) };
    return { ok: true, data: await res.text() };
  } catch (e) {
    return { ok: false, error: `${what}: ${errMsg(e)}` };
  }
}

export const agentPaths = (tree: Tree): string[] =>
  tree.tree.filter((e) => e.type === "blob" && /^\.claude\/agents\/[^/]+\.md$/.test(e.path)).map((e) => e.path).sort();

export interface AgentsData {
  agents: Agent[];
  failed: string[];
}

async function loadAgents(tree: Result<Tree>): Promise<Result<AgentsData>> {
  if (!tree.ok) return { ok: false, error: `agents: needs the file tree (${tree.error})` };
  const paths = agentPaths(tree.data);
  if (paths.length === 0) return { ok: false, error: "agents: no .claude/agents/*.md in tree" };
  const got = await Promise.all(paths.map(async (p) => ({ p, r: await rawFile(`agent ${p}`, p) })));
  const agents: Agent[] = [];
  const failed: string[] = [];
  for (const { p, r } of got) {
    if (r.ok) agents.push({ path: p, raw: r.data });
    else failed.push(r.error);
  }
  if (agents.length === 0) return { ok: false, error: failed[0] };
  return { ok: true, data: { agents, failed } };
}

export interface DocEntry {
  path: string;
  title: string;
}
export interface DocsData {
  specs: DocEntry[];
  decisions: DocEntry[];
}

async function loadDocs(tree: Result<Tree>): Promise<Result<DocsData>> {
  if (!tree.ok) return { ok: false, error: `specs and decisions: needs the file tree (${tree.error})` };
  const one = async (p: string): Promise<DocEntry> => {
    const r = await rawFile(`doc ${p}`, p);
    return { path: p, title: r.ok ? docTitle(p, r.data) : prettyName(p) };
  };
  const [specs, decisions] = await Promise.all([
    Promise.all(docFiles(tree.data, "specs").map(one)),
    Promise.all(docFiles(tree.data, "decisions").map(one)),
  ]);
  return { ok: true, data: { specs, decisions } };
}

export interface SkillsData {
  skills: SkillInfo[];
  failed: string[];
}
async function loadSkills(tree: Result<Tree>): Promise<Result<SkillsData>> {
  if (!tree.ok) return { ok: false, error: `skills: needs the file tree (${tree.error})` };
  const dirs = skillDirs(tree.data);
  if (dirs.length === 0) return { ok: false, error: "skills: no .claude/skills/* in tree" };
  const got = await Promise.all(dirs.map(async (d) => ({ d, r: await rawFile(`skill ${d}`, `.claude/skills/${d}/SKILL.md`) })));
  const skills: SkillInfo[] = [];
  const failed: string[] = [];
  for (const { d, r } of got) {
    if (r.ok) skills.push(parseSkill(d, r.data));
    else {
      skills.push({ name: d, description: "" });
      failed.push(r.error);
    }
  }
  if (failed.length === dirs.length) return { ok: false, error: failed[0] };
  return { ok: true, data: { skills, failed } };
}

export interface Data {
  pulls: Result<Pull[]>;
  runs: Result<Run[]>;
  commitsClaude: Result<Commit[]>;
  commitsClaudeMd: Result<Commit[]>;
  tree: Result<Tree>;
  backlog: Result<string>;
  agents: Result<AgentsData>;
  docs: Result<DocsData>;
  skills: Result<SkillsData>;
}

export async function loadData(): Promise<Data> {
  const [pulls, runsRaw, commitsClaude, commitsClaudeMd, tree, backlog] = await Promise.all([
    api<Pull[]>("pull requests", "/pulls?state=all&per_page=50&sort=updated&direction=desc", "pulls.json"),
    api<{ workflow_runs: Run[] }>("CI runs", "/actions/runs?per_page=100", "runs.json"),
    api<Commit[]>("commits (.claude)", "/commits?path=.claude&per_page=30", "commits-claude.json"),
    api<Commit[]>("commits (CLAUDE.md)", "/commits?path=CLAUDE.md&per_page=30", "commits-claudemd.json"),
    api<Tree>("file tree", "/git/trees/main?recursive=1", "tree.json"),
    rawFile("docs/backlog.md", "docs/backlog.md"),
  ]);
  const runs: Result<Run[]> = runsRaw.ok
    ? Array.isArray(runsRaw.data?.workflow_runs)
      ? { ok: true, data: runsRaw.data.workflow_runs }
      : { ok: false, error: "CI runs: unexpected response shape" }
    : runsRaw;
  const gtree = guardTree(tree);
  const [agents, docs, skills] = await Promise.all([loadAgents(gtree), loadDocs(gtree), loadSkills(gtree)]);
  return { pulls: guardArray(pulls, "pull requests"), runs, commitsClaude: guardArray(commitsClaude, "commits (.claude)"), commitsClaudeMd: guardArray(commitsClaudeMd, "commits (CLAUDE.md)"), tree: gtree, backlog, agents, docs, skills };
}

function guardArray<T>(r: Result<T[]>, what: string): Result<T[]> {
  if (r.ok && !Array.isArray(r.data)) return { ok: false, error: `${what}: unexpected response shape` };
  return r;
}
function guardTree(r: Result<Tree>): Result<Tree> {
  if (r.ok && !Array.isArray(r.data?.tree)) return { ok: false, error: "file tree: unexpected response shape" };
  return r;
}
