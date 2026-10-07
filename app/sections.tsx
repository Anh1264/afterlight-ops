import type { ReactNode } from "react";
import { buildChains, dailyBuckets, fixLabel, isFail, isPass } from "@/lib/chains";
import { countByStatus, type BacklogItem, type BacklogSection, type Status } from "@/lib/backlog";
import { dayParts, durMs, fmtDayTime, fmtLA, lastDays, dayKey, relMs, relTime, firstLine } from "@/lib/format";
import { REPO, type Data, type DocEntry, type Pull, type Result, type Run } from "@/lib/github";
import { groupAgents, hookFiles, changeLog, monogram, parseAgent, type AgentInfo } from "@/lib/team";
import { latestMainRun, merged, openPrs, PR_KINDS, prKind, type CiState, type PrKind } from "@/lib/pulls";

const GH = `https://github.com/${REPO}`;

export function ErrorLine({ msg }: { msg: string }) {
  return <p className="err" role="alert">{msg}</p>;
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="empty m">{children}</p>;
}
function Sub({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="sub m">
      <span>{children}</span>
      {right && <span className="subr">{right}</span>}
    </div>
  );
}

export function Section({ id, n, title, children }: { id: string; n: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="row">
      <div className="lab">
        <div className="n m">{n}</div>
        <h2>{title}</h2>
      </div>
      <div className="body">{children}</div>
    </section>
  );
}

const CI_LABEL: Record<CiState, string> = { ready: "CI green", failing: "CI failing", running: "CI running", none: "No CI" };
const STATUS_ORDER: Status[] = ["review", "building", "spec", "todo", "other"];
const STACK_ORDER: Status[] = ["done", "review", "building", "spec", "other", "todo"];

function Pill({ status }: { status: Status }) {
  return <span className={`pill st-${status} m`}>{status}</span>;
}

/* ---------------- header ---------------- */
export function Header({ data, now }: { data: Data; now: number }) {
  let main: ReactNode = <b>Unknown</b>;
  if (data.runs.ok) {
    const r = latestMainRun(data.runs.data);
    main = r ? (
      <a href={r.html_url}>
        <b><span className={`dot ${r.conclusion === "success" ? "" : "red"}`} />{r.conclusion === "success" ? "Passing" : "Failing"}</b>
      </a>
    ) : <b>No runs</b>;
  }
  return (
    <header>
      <h1>Afterlight<br /><em>Ops</em></h1>
      <div className="meta m">
        <div>Repository<a href={GH}><b>{REPO.toLowerCase()}</b></a></div>
        <div>Main{main}</div>
        <div>Synced<b>{fmtLA(now)}</b></div>
      </div>
    </header>
  );
}

/* ---------------- 1 needs you ---------------- */
export function Needs({ data, sections, now }: { data: Data; sections: Result<BacklogSection[]>; now: number }) {
  const mainRun = data.runs.ok ? latestMainRun(data.runs.data) : null;
  const mainFailed = mainRun !== null && mainRun.conclusion !== "success";
  const review = sections.ok ? sections.data.flatMap((s) => s.items.filter((i) => i.status === "review").map((i) => ({ i, s: s.name }))) : [];
  const list = data.pulls.ok && data.runs.ok ? openPrs(data.pulls.data, data.runs.data) : null;
  const count = (list?.length ?? 0) + review.length;

  return (
    <Section id="needs" n="01" title="Needs you">
      {mainFailed && mainRun && (
        <div className="banner">
          <b>Main is red.</b> The latest run on main failed {relTime(mainRun.created_at, now)}: {fixLabel(mainRun)}{" "}
          <a href={mainRun.html_url}>Open run</a>
        </div>
      )}
      <div className="hero">
        <div className={`num ${count === 0 ? "zero" : ""}`} aria-label={`${count} items need you`}>{count}</div>
        <div className="grow">
          {!data.pulls.ok && <ErrorLine msg={data.pulls.error} />}
          {data.pulls.ok && !data.runs.ok && <ErrorLine msg={`${data.runs.error} (cannot match CI to PRs)`} />}
          {list && list.length === 0 && <Empty>No open pull requests.</Empty>}
          {list?.map(({ pr, ci, run }) => (
            <div className="prline" key={pr.number}>
              <a className="m" href={pr.html_url}>#{pr.number}</a>
              <div className="grow">
                <a className="t" href={pr.html_url}>{pr.title}</a>
                <div className="pm m">
                  <span>{pr.head.ref}</span>
                  <span>{relMs(now - Date.parse(pr.created_at))} old</span>
                  {run ? <a className={`ci ci-${ci}`} href={run.html_url}>{CI_LABEL[ci]}</a> : <span className={`ci ci-${ci}`}>{CI_LABEL[ci]}</span>}
                </div>
              </div>
              <a className={`go ${ci === "ready" ? "" : "alt"}`} href={pr.html_url}>{ci === "ready" ? "Merge" : "View"}</a>
            </div>
          ))}
          {!sections.ok && <ErrorLine msg={sections.error} />}
          {sections.ok && review.length === 0 && <Empty>Nothing in review. No backlog item is waiting on your approval.</Empty>}
          {review.length > 0 && (
            <>
              <Sub>In review · {review.length}</Sub>
              <ul className="rv">
                {review.map(({ i, s }) => (
                  <li key={s + i.id}>
                    <span className="id m">{i.id}</span>
                    <span className="tx clamp2" title={i.text}>{i.text}</span>
                    <span className="sec-name m">{s}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </Section>
  );
}

/* ---------------- shared day chart ---------------- */
interface Col {
  key: string;
  segs: { cls: string; n: number }[];
  title: string;
}
function DayChart({ cols, label }: { cols: Col[]; label: string }) {
  const tot = (c: Col) => c.segs.reduce((a, s) => a + s.n, 0);
  const max = Math.max(1, ...cols.map(tot));
  return (
    <div role="img" aria-label={label}>
      <div className="days">
        {cols.map((c) => {
          const n = tot(c);
          return (
            <div key={c.key} className="day" title={c.title}>
              {c.segs.filter((s) => s.n > 0).map((s) => <i key={s.cls} className={s.cls} style={{ height: `${(s.n / max) * 82}%` }} />)}
              {n > 0 && <b style={{ bottom: `calc(${(n / max) * 82}% + 4px)` }}>{n}</b>}
            </div>
          );
        })}
      </div>
      <div className="dl m">
        {cols.map((c, i) => {
          const p = dayParts(c.key);
          return (
            <span key={c.key} className={tot(c) ? "on" : ""}>
              {(i === 0 || p.day === "1") && <em className="mo">{p.mon} </em>}{p.day}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 2 pipeline ---------------- */
function Kpi({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div>
      <b className={hot ? "hot" : ""}>{value}</b>
      <span>{label}</span>
    </div>
  );
}

const runResult = (r: Run) => (isPass(r) ? "pass" : isFail(r) ? "fail" : r.status !== "completed" ? (r.status ?? "running") : (r.conclusion ?? "unknown"));
const runTitle = (r: Run) => r.display_title || firstLine(r.head_commit?.message) || r.name || String(r.id);

export function Pipeline({ runs, now }: { runs: Result<Run[]>; now: number }) {
  if (!runs.ok) return <Section id="pipeline" n="02" title="Pipeline"><ErrorLine msg={runs.error} /></Section>;
  const st = buildChains(runs.data);
  const ordered = [...runs.data].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const days = dailyBuckets(runs.data, now);
  const top = st.failureList.slice(0, 20);
  return (
    <Section id="pipeline" n="02" title="Pipeline">
      <div className="kp">
        <Kpi label="Pass rate" value={st.passRate === null ? "n/a" : `${Math.round(st.passRate * 100)}%`} />
        <Kpi label="Runs · latest" value={String(runs.data.length)} />
        <Kpi label={st.stillFailing ? `Failures · ${st.stillFailing} still failing` : "Failures"} value={String(st.failures)} hot={st.failures > 0} />
        <Kpi label="Median fix" value={st.medianTimeToFix === null ? "n/a" : durMs(st.medianTimeToFix)} />
      </div>
      <div className="strip" role="group" aria-label="Last CI runs, oldest to newest">
        {ordered.map((r) => (
          <a key={r.id} href={r.html_url} className={isFail(r) ? "f" : isPass(r) ? "" : "o"} title={`${r.head_branch ?? "?"} · ${runTitle(r)} · ${runResult(r)}`} aria-label={`${runResult(r)}: ${runTitle(r)}`} />
        ))}
      </div>
      <div className="ax m"><span>Oldest</span><span className="mid">Every bar is one CI run</span><span>Newest</span></div>

      <Sub right="Pacific time">Runs per day · 14 days</Sub>
      <DayChart
        label="Daily passing and failing CI runs for the last 14 days"
        cols={days.map((d) => ({ key: d.key, segs: [{ cls: "k-pass", n: d.pass }, { cls: "k-fail", n: d.fail }], title: `${d.key}: ${d.pass} passed, ${d.fail} failed` }))}
      />
      <div className="leg m"><span><i className="k-pass" />pass</span><span><i className="k-fail" />fail</span><span className="r">Cancelled and skipped runs ignored</span></div>

      <Sub>Failure → fix</Sub>
      {top.length === 0 ? <Empty>No failed runs in the last {runs.data.length} runs.</Empty> : (
        <div>
          {top.map((f) => (
            <div className="fx" key={f.run.id}>
              <span className="m">{f.prNumber ? <a href={`${GH}/pull/${f.prNumber}`}>#{f.prNumber}</a> : "–"}</span>
              <div className="grow">
                <div className="m fb">{f.branch}</div>
                <a className="ft" href={f.run.html_url}>{runTitle(f.run)}</a>
                {f.fixedBy && <div className="fs">Fixed by <a href={f.fixedBy.html_url}>{fixLabel(f.fixedBy)}</a></div>}
                <div className="fs m">{relTime(f.run.created_at, now)}</div>
              </div>
              {f.fixedBy ? <b className="fd">{durMs(f.timeToFix ?? 0)}</b> : <b className="fd still">Still failing</b>}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ---------------- 3 plan ---------------- */
function ItemRow({ i }: { i: BacklogItem }) {
  return (
    <li>
      <span className="id m">{i.id}</span>
      <span className="sz m">{i.size}</span>
      <Pill status={i.status} />
      <span className="tx clamp3" title={i.text}>{i.text}</span>
    </li>
  );
}

function DocList({ title, files }: { title: string; files: DocEntry[] }) {
  return (
    <div>
      <Sub>{title} · {files.length}</Sub>
      {files.length === 0 ? <Empty>None found.</Empty> : (
        <ul className="docs">
          {files.map((f) => (
            <li key={f.path}>
              <a href={`${GH}/blob/main/${f.path}`}>{f.title}</a>
              <span className="m fn">{f.path.replace(/^docs\/[^/]+\//, "")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Plan({ sections, data }: { sections: Result<BacklogSection[]>; data: Data }) {
  return (
    <Section id="plan" n="03" title="Plan">
      {!sections.ok ? <ErrorLine msg={sections.error} /> : sections.data.length === 0 ? <Empty>docs/backlog.md has no sections.</Empty> : (
        <div className="plans">
          {sections.data.map((s) => {
            const c = countByStatus(s.items);
            const total = s.items.length;
            const pct = total ? Math.round((c.done / total) * 100) : 0;
            const open = STATUS_ORDER.flatMap((k) => s.items.filter((i) => i.status === k));
            const done = s.items.filter((i) => i.status === "done");
            return (
              <article className="ps" key={s.name}>
                <div className="pl">
                  {total > 0 ? (
                    <div className="ph">
                      <div className="stackw">
                        <div className="stack" role="img" aria-label={`${c.done} of ${total} done`}>
                          {STACK_ORDER.map((k) => c[k] > 0 && <i key={k} className={`s-${k}`} style={{ flex: c[k] }} title={`${c[k]} ${k}`} />)}
                        </div>
                      </div>
                      <div>
                        <div className="pp">{pct}<span>%</span></div>
                        <div className="m cnt">{c.done}/{total} done</div>
                      </div>
                    </div>
                  ) : <div className="m cnt">No item table</div>}
                  <h3 className="nm">{s.name}</h3>
                  {s.intro && <p className="intro">{s.intro}</p>}
                </div>
                <div className="pr">
                  {open.length > 0 && <ul className="items">{open.map((i) => <ItemRow key={i.id} i={i} />)}</ul>}
                  {done.length > 0 && (
                    <details className="dn">
                      <summary className="m">{done.length} done</summary>
                      <ul className="items">{done.map((i) => <ItemRow key={i.id} i={i} />)}</ul>
                    </details>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {!data.docs.ok ? <ErrorLine msg={data.docs.error} /> : (
        <div className="two">
          <DocList title="Specs" files={data.docs.data.specs} />
          <DocList title="Decisions (ADRs)" files={data.docs.data.decisions} />
        </div>
      )}
    </Section>
  );
}

/* ---------------- 4 team ---------------- */
function Circles({ list, solid }: { list: AgentInfo[]; solid: boolean }) {
  return (
    <div className={`mg ${solid ? "" : "s"}`}>
      {list.map((a) => <span key={a.file} title={a.name}>{monogram(a.name)}</span>)}
    </div>
  );
}

export function Team({ data, now }: { data: Data; now: number }) {
  const log = data.commitsClaude.ok || data.commitsClaudeMd.ok ? changeLog([data.commitsClaude.ok ? data.commitsClaude.data : [], data.commitsClaudeMd.ok ? data.commitsClaudeMd.data : []], 12) : null;
  const agents = data.agents.ok ? data.agents.data.agents.map((x) => parseAgent(x.path, x.raw)) : null;
  const groups = agents ? groupAgents(agents) : null;
  return (
    <Section id="team" n="04" title="Team">
      {!data.agents.ok ? <ErrorLine msg={data.agents.error} /> : groups && (
        <>
          {data.agents.data.failed.length > 0 && <ErrorLine msg={`${data.agents.data.failed.length} agent file(s) failed to load: ${data.agents.data.failed[0]}`} />}
          <div className="tm">
            <div>
              <h4 className="m">Opus · {groups.opus.length}</h4>
              <Circles list={groups.opus} solid />
              <h4 className="m gap">Sonnet · {groups.sonnet.length}</h4>
              <Circles list={groups.sonnet} solid={false} />
              {groups.other.length > 0 && (
                <>
                  <h4 className="m gap">Other · {groups.other.length}</h4>
                  <Circles list={groups.other} solid={false} />
                </>
              )}
            </div>
            <div className="lg">
              {[...groups.opus, ...groups.sonnet, ...groups.other].map((a) => (
                <div key={a.file}>
                  <a className="m an" href={`${GH}/blob/main/${a.file}`}>{a.name}</a>
                  <span className="m am">{a.model}</span>
                  <span className="ad" title={a.description}>{a.description}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="two">
        <div>
          <Sub>Skills</Sub>
          {!data.skills.ok ? <ErrorLine msg={data.skills.error} /> : (
            <div className="lg">
              {data.skills.data.skills.map((k) => (
                <div key={k.name}>
                  <a className="m an" href={`${GH}/tree/main/.claude/skills/${k.name}`}>/{k.name}</a>
                  <span className="ad" title={k.description}>{k.description}</span>
                </div>
              ))}
            </div>
          )}
          <Sub>Hooks</Sub>
          {!data.tree.ok ? <ErrorLine msg={data.tree.error} /> : (() => {
            const h = hookFiles(data.tree.data);
            return h.length ? <div className="lg">{h.map((x) => <div key={x}><a className="m an hk" href={`${GH}/blob/main/.claude/hooks/${x}`}>{x}</a></div>)}</div> : <Empty>No hooks found.</Empty>;
          })()}
        </div>
        <div>
          <Sub>Change log</Sub>
          {!data.commitsClaude.ok && <ErrorLine msg={data.commitsClaude.error} />}
          {!data.commitsClaudeMd.ok && <ErrorLine msg={data.commitsClaudeMd.error} />}
          {log && (log.length === 0 ? <Empty>No commits touched the team files.</Empty> : (
            <div className="lg log">
              {log.map((c) => (
                <div key={c.sha}>
                  <span className="m when" title={relTime(c.date, now)}>{c.date ? dayLabel(c.date) : "?"}</span>
                  <a className="ad" href={c.url} title={c.title}>{c.title}</a>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function dayLabel(iso: string): string {
  const p = dayParts(dayKey(Date.parse(iso)));
  return `${p.mon} ${p.day}`;
}

/* ---------------- 5 shipped ---------------- */
export function Shipped({ pulls, now }: { pulls: Result<Pull[]>; now: number }) {
  if (!pulls.ok) return <Section id="shipped" n="05" title="Shipped"><ErrorLine msg={pulls.error} /></Section>;
  const all = merged(pulls.data, 1000);
  const keys = lastDays(now, 14);
  const byDay = new Map<string, Pull[]>(keys.map((k) => [k, []]));
  for (const p of all) byDay.get(dayKey(Date.parse(p.merged_at ?? "")))?.push(p);
  const inWindow = keys.reduce((a, k) => a + (byDay.get(k)?.length ?? 0), 0);
  const cols: Col[] = keys.map((k) => {
    const list = byDay.get(k) ?? [];
    const kinds = new Map<PrKind, number>();
    for (const p of list) kinds.set(prKind(p.title), (kinds.get(prKind(p.title)) ?? 0) + 1);
    const p = dayParts(k);
    return {
      key: k,
      segs: PR_KINDS.map((kd) => ({ cls: `k-${kd}`, n: kinds.get(kd) ?? 0 })),
      title: `${p.mon} ${p.day}: ${list.length} merged${list.length ? "\n" + list.map((x) => `#${x.number} ${x.title}`).join("\n") : ""}`,
    };
  });
  const recent = all.slice(0, 10);
  return (
    <Section id="shipped" n="05" title="Shipped">
      <DayChart cols={cols} label="Pull requests merged per day for the last 14 days, by kind" />
      <div className="leg m">
        {PR_KINDS.map((k) => <span key={k}><i className={`k-${k}`} />{k}</span>)}
        <span className="r">{inWindow} PRs merged · last 14 days</span>
      </div>
      <Sub>Last {recent.length} merged</Sub>
      {recent.length === 0 ? <Empty>No merged pull requests in the latest 50.</Empty> : (
        <ul className="mp">
          {recent.map((p) => (
            <li key={p.number}>
              <a className="m" href={p.html_url}>#{p.number}</a>
              <a className="tx" href={p.html_url}>{p.title}</a>
              <span className="m dt">{p.merged_at ? fmtDayTime(p.merged_at) : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function Footer() {
  return <footer className="foot m">Data refreshes every 5 min.</footer>;
}
