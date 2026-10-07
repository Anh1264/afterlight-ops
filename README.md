# afterlight-ops

Read-only ops dashboard for the Afterlight agent dev team (one page: what needs the owner, CI health, plan progress, team changes, recent PR activity). Next.js App Router, server components, no other runtime deps, no login. Data revalidates every 5 minutes.

## Env vars

| Var | Default | Purpose |
| --- | --- | --- |
| `REPO` | `Anh1264/afterlight` | GitHub `owner/name` to watch (branch `main`) |
| `GITHUB_TOKEN` | unset | Optional. Sent as a Bearer token to api.github.com; without it the 60 requests/hour limit applies (each render uses 5 API calls) |
| `DATA_SOURCE` | live | `fixture` reads `fixtures/*.json` and raw files from `LOCAL_REPO` |
| `LOCAL_REPO` | unset | Path to a local clone, used only with `DATA_SOURCE=fixture` |

Each data source fails independently and shows an error line in its section.

## Develop

```
npm install
DATA_SOURCE=fixture LOCAL_REPO=/path/to/afterlight npm run dev
npm run build        # live mode; needs network to show data
npm run fixtures -- /path/to/afterlight   # regenerate fixtures/ from a clone
```

Node 22. Deploy on Vercel with defaults.
