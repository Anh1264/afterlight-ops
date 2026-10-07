// Generates fixtures/*.json in GitHub API shape from a local clone.
// Usage: node scripts/gen-fixtures.mjs [path-to-clone]   (default: $LOCAL_REPO)
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const repoDir = process.argv[2] || process.env.LOCAL_REPO;
if (!repoDir) throw new Error("pass the clone path or set LOCAL_REPO");
const REPO = "Anh1264/afterlight";
const git = (...a) => execFileSync("git", ["-C", repoDir, ...a], { encoding: "utf8", maxBuffer: 64e6 }).trim();
const iso = (d) => new Date(d).toISOString().replace(/\.\d+Z$/, "Z");
const mins = (d, m) => iso(new Date(d).getTime() + m * 60000);
const fakeSha = (seed) => {
  let h = 0x811c9dc5, out = "";
  for (let r = 0; out.length < 40; r++) {
    for (const c of seed + r) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    out += h.toString(16).padStart(8, "0");
  }
  return out.slice(0, 40);
};

// ---- merged PRs from merge commits
const merges = git("log", "--merges", "--format=%H%x1f%P%x1f%an%x1f%aI%x1f%s%x1f%b%x1e").split("\x1e").map((s) => s.trim()).filter(Boolean)
  .map((r) => r.split("\x1f"))
  .map(([sha, parents, author, date, subject, body]) => ({ sha, parents: parents.split(" "), author, date, subject, body }));
const prMerges = merges.map((m) => ({ m, x: /^Merge pull request #(\d+) from [^/]+\/(.+)$/.exec(m.subject) })).filter((o) => o.x);

const user = { login: "Anh1264", type: "User" };
const pulls = [];
const runs = [];
let runId = 11000000;
const mkRun = (o) => {
  const created = o.created_at;
  const dur = o.dur ?? 6;
  return {
    id: runId++, name: "CI", head_branch: o.branch, head_sha: o.sha, event: o.event ?? "pull_request",
    status: o.status ?? "completed", conclusion: o.conclusion ?? null,
    created_at: created, updated_at: mins(created, dur),
    html_url: `https://github.com/${REPO}/actions/runs/${runId - 1}`,
    display_title: o.title, head_commit: { message: o.msg ?? o.title },
    pull_requests: o.pr ? [{ number: o.pr }] : [],
  };
};

// failure scenarios: PR number -> failing attempts before the final green one
const failPlans = {
  20: [{ msg: "feat(CARDS2): wave 1 - 41 new cards", why: "test: card text lint", fix: "fix(CARDS2): rules text lint for 3 cards" }, { why: "e2e flake", fix: "test: retry flaky mulligan e2e" }],
  19: [{ why: "typecheck", fix: "fix(E9): validate no-target effects in protocol parser" }],
  15: [{ why: "vitest", fix: "test(T6): wait for server:ended before asserting" }, { why: "vitest", fix: "test(T6): await close frame" }],
  12: [{ why: "build", fix: "fix(C12): readable inspect panel on small cards" }],
  9: [{ why: "fuzzer", fix: "fix(DM-1): bot round-one heuristic handles pass-first" }],
  5: [{ why: "lint", fix: "fix(P0-4): rate-limit table typing" }],
};

for (const { m, x } of prMerges) {
  const number = Number(x[1]), branch = x[2];
  const headSha = m.parents[1] || fakeSha("head" + number);
  let title = (m.body.split("\n").find((l) => l.trim() && !/^Co-Authored/i.test(l)) || branch).trim();
  const mergedAt = iso(m.date);
  const createdAt = mins(mergedAt, -(35 + (number * 17) % 160));
  pulls.push({
    number, title, state: "closed", draft: false, user,
    html_url: `https://github.com/${REPO}/pull/${number}`,
    created_at: createdAt, updated_at: mergedAt, closed_at: mergedAt, merged_at: mergedAt,
    merge_commit_sha: m.sha, head: { ref: branch, sha: headSha }, base: { ref: "main" },
  });
  // failing attempts
  const plan = failPlans[number] || [];
  let t = new Date(createdAt).getTime() + 4 * 60000;
  const span = (new Date(mergedAt).getTime() - t) / (plan.length + 1);
  plan.forEach((p, i) => {
    const at = iso(t + span * i);
    runs.push(mkRun({ branch, sha: fakeSha(`fail${number}-${i}`), conclusion: "failure", created_at: at, title: i === 0 ? title : plan[i - 1].fix, msg: i === 0 ? title : plan[i - 1].fix, pr: number }));
    void p;
  });
  const lastMsg = plan.length ? plan[plan.length - 1].fix : title;
  runs.push(mkRun({ branch, sha: headSha, conclusion: "success", created_at: iso(t + span * plan.length), title: lastMsg, msg: lastMsg, pr: number }));
  // main run on merge
  const mainFail = number === 13;
  runs.push(mkRun({ branch: "main", sha: m.sha, event: "push", conclusion: mainFail ? "failure" : "success", created_at: mins(mergedAt, 1), title: m.subject, msg: `${m.subject}\n\n${title}` }));
  if (mainFail) runs.push(mkRun({ branch: "main", sha: fakeSha("mainfix13"), event: "push", conclusion: "success", created_at: mins(mergedAt, 25), title: "fix: restore gallery route after merge", msg: "fix: restore gallery route after merge" }));
}

// ---- extra PRs: open green, open failing, closed unmerged, open running
const newest = prMerges.map((o) => new Date(o.m.date).getTime()).reduce((a, b) => Math.max(a, b));
const base = newest + 20 * 60000;
const extra = [
  { number: 21, branch: "feat/CARDS2-wave2", title: "feat(CARDS2): wave 2 - 30 more cards", conclusion: "success", state: "open", age: 70 },
  { number: 22, branch: "fix/E9-validate-no-target-v2", title: "fix(E9): reject targetless effects client-side too", conclusion: "failure", state: "open", age: 45 },
  { number: 23, branch: "docs/agent-eval-set", title: "docs(AG-8): eval set for agent changes", conclusion: null, status: "in_progress", state: "open", age: 8 },
  { number: 24, branch: "chore/no-ci-yet", title: "chore: scratch notes", conclusion: "none", state: "open", age: 30 },
  { number: 16, branch: "feat/DM-9-try-wave", title: "feat(DM-9): abandoned try", conclusion: "failure", state: "closed", age: 600 },
];
for (const e of extra) {
  const created = iso(base - e.age * 60000);
  const sha = fakeSha("pr" + e.number);
  pulls.push({
    number: e.number, title: e.title, state: e.state, draft: false, user,
    html_url: `https://github.com/${REPO}/pull/${e.number}`,
    created_at: created, updated_at: iso(base - (e.age / 2) * 60000),
    closed_at: e.state === "closed" ? iso(base - 300 * 60000) : null, merged_at: null,
    merge_commit_sha: null, head: { ref: e.branch, sha }, base: { ref: "main" },
  });
  if (e.conclusion !== "none")
    runs.push(mkRun({ branch: e.branch, sha, conclusion: e.conclusion, status: e.status, created_at: created, title: e.title, pr: e.number, dur: 7 }));
}
// a cancelled run (ignored in rates)
runs.push(mkRun({ branch: "feat/CARDS2-wave2", sha: fakeSha("cancelled"), conclusion: "cancelled", created_at: iso(base - 75 * 60000), title: "feat(CARDS2): wave 2 (superseded)", pr: 21 }));

pulls.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
runs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

// ---- commits touching .claude / CLAUDE.md
const commitsFor = (path) =>
  git("log", "-30", "--format=%H%x1f%P%x1f%an%x1f%aI%x1f%B%x1e", "--", path).split("\x1e").map((s) => s.trim()).filter(Boolean).map((r) => {
    const [sha, parents, an, date, message] = r.split("\x1f");
    return {
      sha, html_url: `https://github.com/${REPO}/commit/${sha}`,
      commit: { message: message.trim(), author: { name: an, date: iso(date) } },
      author: { login: "Anh1264" }, parents: parents.split(" ").filter(Boolean).map((s) => ({ sha: s })),
    };
  });

// ---- tree (trimmed to the paths the dashboard reads)
const names = git("ls-tree", "-r", "--name-only", "HEAD").split("\n").filter((p) => /^(\.claude\/|docs\/|CLAUDE\.md$)/.test(p));
const tree = { sha: fakeSha("tree"), truncated: false, tree: names.map((p) => ({ path: p, type: "blob", mode: "100644", sha: fakeSha(p) })) };

mkdirSync("fixtures", { recursive: true });
const w = (f, o) => writeFileSync(`fixtures/${f}`, JSON.stringify(o) + "\n");
w("pulls.json", pulls.slice(0, 50));
w("runs.json", { total_count: runs.length, workflow_runs: runs.slice(0, 100) });
w("commits-claude.json", commitsFor(".claude"));
w("commits-claudemd.json", commitsFor("CLAUDE.md"));
w("tree.json", tree);
console.log({ pulls: pulls.length, runs: runs.length, tree: names.length });
