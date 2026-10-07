import { parseBacklog } from "@/lib/backlog";
import { loadData } from "@/lib/github";
import type { Result } from "@/lib/github";
import type { BacklogSection } from "@/lib/backlog";
import { Activity, Header, Needs, Pipeline, Plan, Team } from "./sections";

export const revalidate = 300;

export default async function Page() {
  const data = await loadData();
  const now = Date.now();
  let sections: Result<BacklogSection[]>;
  if (!data.backlog.ok) sections = data.backlog;
  else {
    try {
      sections = { ok: true, data: parseBacklog(data.backlog.data) };
    } catch (e) {
      sections = { ok: false, error: `docs/backlog.md: parse failed (${e instanceof Error ? e.message : "unknown"})` };
    }
  }
  return (
    <>
      <Header data={data} now={now} />
      <main className="wrap">
        <Needs data={data} sections={sections} now={now} />
        <Pipeline runs={data.runs} now={now} />
        <Plan sections={sections} data={data} />
        <Team data={data} now={now} />
        <Activity pulls={data.pulls} now={now} />
      </main>
    </>
  );
}
