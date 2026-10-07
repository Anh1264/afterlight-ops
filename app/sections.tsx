import type { ReactNode } from "react";
import { buildChains, dailyBuckets, fixLabel, type PipelineStats } from "@/lib/chains";
import { countByStatus, STATUSES, type BacklogSection, type Status } from "@/lib/backlog";
import { durMs, fmtDay, fmtLA, relTime, truncate, prettyName } from "@/lib/format";
import { REPO, type Data, type Pull, type Result, type Run } from "@/lib/github";
import { changeLog, docFiles, groupAgents, hookFiles, parseAgent, skillDirs, type AgentInfo } from "@/lib/team";
import { closedUnmerged, latestMainRun, merged, openPrs, type CiState } from "@/lib/pulls";

const GH = `https://github.com/${REPO}`;

export function ErrorLine({ msg }: { msg: string }) {
  return <p className="err" role="alert">{msg}</p>;
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
function Sub({ children }: { children: ReactNode }) {
  return <h3 className="sub">{children}</h3>;
}
const Sha = ({ sha }: { sha: string }) => <code>{sha.slice(0, 7)}</code>;

export function Section({ id, n, title, children }: { id: string; n: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="sec">
      <h2><span className="secnum">{n}</span>{title}</h2>
      {children}
    </section>
  );
}

const CI_LABEL: Record<CiState, string> = { ready: "Ready to merge", failing: "CI failing", running: "CI running", none: "No CI" };
const CI_TONE: Record<CiState, string> = { ready: "green", failing: "red", running: "blue", none: "gray" };

function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
const STATUS_TONE: Record<Status, string> = { done: "green", review: "amber", building: "blue", spec: "violet", todo: "gray", other: "gray" };

/* ---------------- header ---------------- */
export function Header({ data, now }: { data: Data; now: number }) {
  let main: ReactNode = <span className="muted">unknown</span>;
  if (data.runs.ok) {
    const r = latestMainRun(data.runs.data);
    main = r ? (
      <a href={r.html_url} className="mainstat">
        <span className={`dot ${r.conclusion === "success" ? "green" : "red"}`} />
        main CI {r.conclusion === "success" ? "passing" : "failing"} <span className="muted">{relTime(r.created_at, now)}</span>
      </a>
    ) : <span className="muted">no completed main runs</span>;
  }
  return (
    <header className="top">
      <div className="wrap toprow">
        <h1>AFTERLIGHT <span>ops</span></h1>
        <div className="meta">
          <a href={GH} className="mono">{REPO}</a>
          {main}
          <span className="muted">fetched {fmtLA(now)}</span>
        </div>
      </div>
      <nav className="wrap nav" aria-label="Sections">
        <a href="#needs">Needs you</a>
        <a href="#pipeline">Pipeline</a>
        <a href="#plan">Plan</a>
        <a href="#team">Team</a>
        <a href="#activity">Activity</a>
      </nav>
    </header>
  );
}

/* ---------------- 1 needs you ---------------- */
export function Needs({ data, sections, now }: { data: Data; sections: Result<BacklogSection[]>; now: number }) {
  const mainRun = data.runs.ok ? latestMainRun(data.runs.data) : null;
  const mainFailed = mainRun !== null && mainRun.conclusion !== "success";
  const review = sections.ok ? sections.data.flatMap((s) => s.items.filter((i) => i.status === "review").map((i) => ({ i, s: s.name }))) : [];
  const list = data.pulls.ok && data.runs.ok ? openPrs(data.pulls.data, data.runs.data) : null;

  return (
    <Section id="needs" n="01" title="Needs you">
      {!data.runs.ok && <ErrorLine msg={data.runs.error} />}
      {mainFailed && mainRun && (
        <div className="banner">
          <strong>Main is red.</strong> Latest run on main failed {relTime(mainRun.created_at, now)}: {truncate(fixLabel(mainRun), 100)}{" "}
          <a href={mainRun.html_url}>open run</a>
        </div>
      )}
      <Sub>Open pull requests</Sub>
      {!data.pulls.ok ? <ErrorLine msg={data.pulls.error} /> : !data.runs.ok ? <ErrorLine msg="Cannot match CI to PRs without runs." /> : list && list.length === 0 ? (
        <Empty>No open pull requests.</Empty>
      ) : (
        <table className="tbl">
          <thead><tr><th>PR</th><th>Title</th><th>Branch</th><th>CI</th><th>Age</th></tr></thead>
          <tbody>
            {list?.map(({ pr, ci, run }) => (
              <tr key={pr.number}>
                <td data-l="PR"><a href={pr.html_url} className="mono">#{pr.number}</a></td>
                <td data-l="Title">{truncate(pr.title, 100)}</td>
                <td data-l="Branch"><code>{pr.head.ref}</code></td>
                <td data-l="CI">{run ? <a href={run.html_url}><Pill tone={CI_TONE[ci]}>{CI_LABEL[ci]}</Pill></a> : <Pill tone={CI_TONE[ci]}>{CI_LABEL[ci]}</Pill>}</td>
                <td data-l="Age">{relTime(pr.created_at, now)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Sub>Backlog items in review</Sub>
      {!sections.ok ? <ErrorLine msg={sections.error} /> : review.length === 0 ? (
        <Empty>Nothing in review. No backlog item is waiting on your approval.</Empty>
      ) : (
        <ul className="rows">
          {review.map(({ i, s }) => (
            <li key={i.id + s}>
              <code className="id">{i.id}</code>
              <span className="grow">{truncate(i.text, 140)}</span>
              <span className="muted small">{s}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ---------------- 2 pipeline ---------------- */
function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="kpi">
      <div className={`kv ${tone ?? ""}`}>{value}</div>
      <div className="kl">{label}</div>
    </div>
  );
}

function PrCell({ n }: { n: number | null }) {
  return n ? <a href={`${GH}/pull/${n}`} className="mono">#{n}</a> : <span className="muted">-</span>;
}

export function Pipeline({ runs, now }: { runs: Result<Run[]>; now: number }) {
  if (!runs.ok) return <Section id="pipeline" n="02" title="Pipeline"><ErrorLine msg={runs.error} /></Section>;
  const st: PipelineStats = buildChains(runs.data);
  const top = st.failureList.slice(0, 20);
  const days = dailyBuckets(runs.data, now);
  const max = Math.max(1, ...days.map((d) => d.pass + d.fail));
  return (
    <Section id="pipeline" n="02" title="Pipeline">
      <div className="kpis">
        <Kpi label={`pass rate, last ${runs.data.length} runs`} value={st.passRate === null ? "n/a" : `${Math.round(st.passRate * 100)}%`} tone={st.passRate !== null && st.passRate < 0.8 ? "red" : "green"} />
        <Kpi label="failures" value={String(st.failures)} />
        <Kpi label="still failing" value={String(st.stillFailing)} tone={st.stillFailing ? "red" : "green"} />
        <Kpi label="median time to fix" value={st.medianTimeToFix === null ? "n/a" : durMs(st.medianTimeToFix)} />
      </div>
      <Sub>Runs per day, 14 days (PT)</Sub>
      <div className="strip" role="img" aria-label="Daily passing and failing CI runs for the last 14 days">
        {days.map((d) => (
          <div key={d.key} className="day" title={`${d.key}: ${d.pass} passed, ${d.fail} failed`}>
            <div className="bars">
              <div className="stack" style={{ height: `${((d.pass + d.fail) / max) * 100}%` }}>
                {d.fail > 0 && <i className="b red" style={{ flexGrow: d.fail }} />}
                {d.pass > 0 && <i className="b green" style={{ flexGrow: d.pass }} />}
              </div>
            </div>
            <span className="dn">{d.pass + d.fail || ""}</span>
            <span className="dl">{d.key.slice(8)}</span>
          </div>
        ))}
      </div>
      <p className="legend"><i className="sw green" /> pass <i className="sw red" /> fail; day of month on the axis, cancelled and skipped runs ignored.</p>
      <Sub>Latest failures and their fixes</Sub>
      {top.length === 0 ? <Empty>No failed runs in the last {runs.data.length} runs.</Empty> : (
        <table className="tbl">
          <thead><tr><th>Branch</th><th>PR</th><th>Run</th><th>When</th><th>Outcome</th></tr></thead>
          <tbody>
            {top.map((f) => (
              <tr key={f.run.id}>
                <td data-l="Branch"><code>{f.branch}</code></td>
                <td data-l="PR"><PrCell n={f.prNumber} /></td>
                <td data-l="Run"><a href={f.run.html_url}>{truncate(f.run.display_title || f.run.name || String(f.run.id), 70)}</a></td>
                <td data-l="When">{relTime(f.run.created_at, now)}</td>
                <td data-l="Outcome">
                  {f.fixedBy ? (
                    <span>
                      <Pill tone="green">fixed in {durMs(f.timeToFix ?? 0)}</Pill>{" "}
                      <a href={f.fixedBy.html_url} className="small">{truncate(fixLabel(f.fixedBy), 70)}</a>
                    </span>
                  ) : <Pill tone="red">still failing</Pill>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

/* ---------------- 3 plan ---------------- */
function StackBar({ counts, total }: { counts: Record<Status, number>; total: number }) {
  return (
    <div className="pbar" aria-hidden="true">
      {total > 0 && (["done", "review", "building", "spec", "todo", "other"] as Status[]).map((s) => counts[s] > 0 && <i key={s} className={`seg ${STATUS_TONE[s]} s-${s}`} style={{ flexGrow: counts[s] }} />)}
    </div>
  );
}

function DocList({ title, base, files }: { title: string; base: string; files: string[] }) {
  return (
    <div>
      <Sub>{title}</Sub>
      {files.length === 0 ? <Empty>None found.</Empty> : (
        <ul className="links">
          {files.map((f) => <li key={f}><a href={`${GH}/blob/main/${f}`}>{prettyName(f)}</a><span className="muted small mono">{f.replace(base, "")}</span></li>)}
        </ul>
      )}
    </div>
  );
}

export function Plan({ sections, data }: { sections: Result<BacklogSection[]>; data: Data }) {
  return (
    <Section id="plan" n="03" title="Plan">
      {!sections.ok ? <ErrorLine msg={sections.error} /> : sections.data.length === 0 ? <Empty>docs/backlog.md has no sections with tables.</Empty> : (
        <div className="plans">
          {sections.data.map((s) => {
            const c = countByStatus(s.items);
            const total = s.items.length;
            const pct = total ? Math.round((c.done / total) * 100) : null;
            return (
              <details key={s.name} className="plan">
                <summary>
                  <span className="pname">{s.name}</span>
                  <span className="pct mono">{pct === null ? "n/a" : `${pct}%`}</span>
                  <StackBar counts={c} total={total} />
                  <span className="counts small">
                    {STATUSES.filter((k) => c[k] > 0).map((k) => <span key={k}><i className={`sw ${STATUS_TONE[k]}`} />{c[k]} {k}</span>)}
                    {total === 0 && <span className="muted">no item rows</span>}
                  </span>
                </summary>
                {s.intro && <p className="intro">{truncate(s.intro, 240)}</p>}
                {s.items.length > 0 && (
                  <ul className="items">
                    {s.items.map((i) => (
                      <li key={i.id}>
                        <code className="id">{i.id}</code>
                        <span className="muted mono small sz">{i.size}</span>
                        <Pill tone={STATUS_TONE[i.status]}>{i.status}</Pill>
                        <span className="grow">{truncate(i.text, 140)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {s.prs.length > 0 && (
                  <ul className="items prs">
                    {s.prs.map((p) => (
                      <li key={p.pr}>
                        <code className="id">PR</code>
                        <Pill tone={STATUS_TONE[p.status]}>{p.status}</Pill>
                        <span className="grow">{p.pr}: {truncate(p.items, 100)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            );
          })}
        </div>
      )}
      {!data.tree.ok ? <ErrorLine msg={data.tree.error} /> : (
        <div className="two">
          <DocList title="Specs" base="docs/specs/" files={docFiles(data.tree.data, "specs")} />
          <DocList title="Decisions (ADRs)" base="docs/decisions/" files={docFiles(data.tree.data, "decisions")} />
        </div>
      )}
    </Section>
  );
}

/* ---------------- 4 team ---------------- */
function AgentCard({ a }: { a: AgentInfo }) {
  return (
    <div className="agent">
      <div className="ahead"><a href={`${GH}/blob/main/${a.file}`} className="aname mono">{a.name}</a>{a.effort && <span className="muted small mono">{a.effort}</span>}</div>
      <p className="adesc">{truncate(a.description, 160)}</p>
      {a.tools.length > 0 && <p className="atools mono">{a.tools.join(" ")}</p>}
    </div>
  );
}

export function Team({ data, now }: { data: Data; now: number }) {
  const log = data.commitsClaude.ok || data.commitsClaudeMd.ok ? changeLog([data.commitsClaude.ok ? data.commitsClaude.data : [], data.commitsClaudeMd.ok ? data.commitsClaudeMd.data : []]) : null;
  const groups = data.agents.ok ? groupAgents(data.agents.data.agents.map((x) => parseAgent(x.path, x.raw))) : null;
  return (
    <Section id="team" n="04" title="Team">
      <Sub>Agents</Sub>
      {!data.agents.ok ? <ErrorLine msg={data.agents.error} /> : (
        <>
          {data.agents.data.failed.length > 0 && <ErrorLine msg={`${data.agents.data.failed.length} agent file(s) failed to load: ${data.agents.data.failed[0]}`} />}
          {groups && (["opus", "sonnet", "other"] as const).map((g) => groups[g].length > 0 && (
            <div key={g} className="group">
              <h4 className={`gh ${g}`}>{g} <span className="muted">{groups[g].length}</span></h4>
              <div className="agents">{groups[g].map((a) => <AgentCard key={a.file} a={a} />)}</div>
            </div>
          ))}
        </>
      )}
      <div className="two">
        <div>
          <Sub>Skills</Sub>
          {!data.tree.ok ? <ErrorLine msg={data.tree.error} /> : (() => {
            const s = skillDirs(data.tree.data);
            return s.length ? <p className="chips">{s.map((x) => <a key={x} className="chip mono" href={`${GH}/tree/main/.claude/skills/${x}`}>{x}</a>)}</p> : <Empty>No skills found.</Empty>;
          })()}
        </div>
        <div>
          <Sub>Hooks</Sub>
          {!data.tree.ok ? <ErrorLine msg={data.tree.error} /> : (() => {
            const h = hookFiles(data.tree.data);
            return h.length ? <p className="chips">{h.map((x) => <a key={x} className="chip mono" href={`${GH}/blob/main/.claude/hooks/${x}`}>{x}</a>)}</p> : <Empty>No hooks found.</Empty>;
          })()}
        </div>
      </div>
      <Sub>Team change log (.claude and CLAUDE.md)</Sub>
      {!data.commitsClaude.ok && <ErrorLine msg={data.commitsClaude.error} />}
      {!data.commitsClaudeMd.ok && <ErrorLine msg={data.commitsClaudeMd.error} />}
      {log && (log.length === 0 ? <Empty>No commits touched the team files.</Empty> : (
        <ul className="rows">
          {log.map((c) => (
            <li key={c.sha}>
              <span className="muted small mono when" title={relTime(c.date, now)}>{c.date ? fmtDay(c.date) : "?"}</span>
              <a className="grow" href={c.url}>{truncate(c.title, 140)}</a>
              <span className="muted small">{c.author} <Sha sha={c.sha} /></span>
            </li>
          ))}
        </ul>
      ))}
    </Section>
  );
}

/* ---------------- 5 activity ---------------- */
function PrList({ pulls, field, now }: { pulls: Pull[]; field: "merged_at" | "closed_at"; now: number }) {
  return (
    <ul className="rows">
      {pulls.map((p) => (
        <li key={p.number}>
          <a href={p.html_url} className="mono">#{p.number}</a>
          <span className="grow">{truncate(p.title, 100)}</span>
          <code className="small">{p.head.ref}</code>
          <span className="muted small">{relTime(p[field], now)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Activity({ pulls, now }: { pulls: Result<Pull[]>; now: number }) {
  if (!pulls.ok) return <Section id="activity" n="05" title="Activity"><ErrorLine msg={pulls.error} /></Section>;
  const m = merged(pulls.data);
  const c = closedUnmerged(pulls.data);
  return (
    <Section id="activity" n="05" title="Activity">
      <Sub>Recently merged</Sub>
      {m.length ? <PrList pulls={m} field="merged_at" now={now} /> : <Empty>No merged pull requests in the latest 50.</Empty>}
      <Sub>Closed without merging</Sub>
      {c.length ? <PrList pulls={c} field="closed_at" now={now} /> : <Empty>None in the latest 50.</Empty>}
    </Section>
  );
}
