# Teams app screenshots

Captured from the **Teams channel-tab web UI** (`teams-app/tab`, served by the
`ca-dealhub-teams` container), so they show exactly what Teams renders. The repo landing
page ([../../README.md](../../README.md)) uses five of them; the last two are kept for the
deeper docs.

| File | Where it's used | What it shows |
|---|---|---|
| `teams-dashboard.png` | README hero | The Home desk — a partner's daily briefing, composed from the deal record, with a numbered evidence marker behind each claim. |
| `teams-agent-chat.png` | 💬 An AI deal team you @mention | The assistant answering *“which deal is the highest priority right now, and why?”* beside the briefing. |
| `teams-stage1.png` | 🗂️ The whole lifecycle | Sourcing & screening — deals in origination, with the mandate and screening framework behind the sub-tabs. |
| `teams-deal-cockpit.png` | 🧭 A Deal brief built for the deal team | A deal opening on *where to start*, the IC clock, and the five pages every deal has. |
| `teams-rbac.png` | 🔐 Need-to-know access | An analyst on a deal they are not cleared for — status only, with *Ask to join the deal team*. |
| `teams-stage2.png` | — | The **All deals** list: 19 deals segmented by stage, with the IC-ready ones called out. |
| `teams-stage1-analytics.png` | — | A deal's **Analysis** page — the paper LBO, its returns against the hurdle, and the basis it was struck on. |

## Refreshing them

The **beta** tab is the one to shoot: it sets `DEMO_OPEN_SIGN_IN`, so a browser with no
directory account can hold a demo seat. The dev tab does not, and will sit on
*“Loading your deals…”* behind a 401.

1. Open the tab with a seat named in the query string — the roster ids are `admin`,
   `partner`, `deal-team`, `analyst`, `principal`, `fund-cfo`, `member`, …:

   ```
   https://<teams-beta-host>/?dr_as=partner#/overview
   ```

2. Dismiss the *“Now viewing as …”* access note (`.sbn-x`) — it is demo chrome, not product.
3. Drive the view, then save a PNG over the file above, keeping the same name.

Shoot every file at the **same viewport** so the set reads as one product (the current set
is 919 × 608). For the access shot, pick a seat and a deal that genuinely collide —
`?dr_as=analyst` on a deal outside their territory returns the real status-only view rather
than a staged lock.
