# CRM Proof Pipeline

Pipedream workflows for email QA, rendering, and newsletter content approval at McClatchy. This repo is synced to a Pipedream project — commits to `production` auto-deploy to the live workflows.

## What's in this repo

### Reusable services

Composable HTTP-triggered workflows that other workflows can call via callback.

- **`email-test-api-p_WxCpReW/`** — POST `{ html_body, callback_url }` → submits the HTML directly to Email on Acid, polls for completion with `$.flow.rerun`, POSTs screenshots to the callback URL. Works in ~3–7 minutes (no Braze round-trip, no subject-based search). Used for email QA and can be called by any workflow or tool (including Claude) to validate rendered HTML.
- **`braze-render-p_vQCkbQW/`** — POST `{ liquid, callback_url }` → sends the Liquid through Braze to a dedicated Pipedream email address. Braze renders the Liquid. The rendered HTML is captured by `braze-email-capture` and POSTed back to the callback URL. Used when you need to render Liquid/personalization before testing.
- **`braze-email-capture-p_ZJCr8lx/`** — internal email-triggered workflow paired with `braze-render`. Receives the rendered email from Braze, looks up the callback URL in a shared data store (`ds_7QundV5`) keyed by subject, and POSTs the rendered HTML to the caller.

### Proof pipeline

Per-campaign QC: sends test emails ~1 hour before send time, generates cross-client screenshots, and (for newsletters) posts an approval message to Slack.

- **`qc-proof-scheduler-p_5VCPmd9/`** — cron-style scheduler. Fetches today's scheduled Braze messages, filters by the `Proof` tag, and fans out. The `route_and_trigger` step (disabled by default) also checks `NEWSLETTER_CONFIG` for each matching campaign and fires `newsletter-content-prep` alongside the proof pipeline.
- **`qc-proof-pipeline-p_7NCyxw2/`** — per-campaign pipeline. Delays until T-1h, sends a test email through Braze, waits 10 min, pulls EOA screenshots, uploads to Google Drive (`YYYY-MM-DD/{campaign}/`), then posts to Slack. For newsletter campaigns, the `post_and_suspend` step calls `$.flow.suspend()` and posts a Block Kit message with Approve/Reject URL buttons. When a button is clicked (or the timeout fires at T-10m), `apply_decision` runs.
- **`qc-slack-approval-p_JZCz5G5/`** — legacy Slack message viewer (inactive). Retained for backwards compatibility; the new approval flow uses `$.flow.suspend` inside the proof pipeline and does not depend on this workflow.

### Newsletter content pipeline

Locks stories into a Braze catalog, generates AI subject/intro, writes history to Snowflake.

- **`newsletter-content-prep-p_zAC1lWL/`** — per-newsletter prep. Reads per-newsletter config from Snowflake, fetches the JSON feed, inserts a `NEWSLETTER_RUNS` row (UUID via `UUID_STRING()`), upserts `slot_1..slot_N` rows into the Braze catalog, calls OpenAI to generate `ai_subject` + `ai_intro`, upserts the `meta` row with the AI content, and writes it all to Snowflake history. Then exits — no waiting. The approval wait happens later in `qc-proof-pipeline`.
- **SQL DDL:** `newsletter-content-prep-p_zAC1lWL/sql/schema.sql` — `NEWSLETTER_CONFIG` and `NEWSLETTER_RUNS` table definitions. Tables live in `MCC_RAW.MARKETING_DEV`.

### Placeholders / inactive

- **`feed-sync-p_yKCmLGq/`** — stub.
- **`proof-ochestrator-p_vQCkbBw/`** — stub.

---

## Standard newsletter flow

```mermaid
flowchart TD
  cron[qc-proof-scheduler cron] --> filter{Filter by Proof tag}
  filter -->|newsletter match| prep[newsletter-content-prep]
  filter -->|all matches| proof[qc-proof-pipeline]

  prep --> fetchfeed[Fetch JSON feed]
  fetchfeed --> snowhist[INSERT NEWSLETTER_RUNS]
  snowhist --> slotupsert[Braze PUT slot_1..N]
  slotupsert --> openai[OpenAI subject + intro]
  openai --> metaupsert[Braze PUT meta row]
  metaupsert --> updatehist[UPDATE NEWSLETTER_RUNS]
  updatehist --> prepdone((prep done))

  proof --> proofwait[Delay until T-1h]
  proofwait --> testsend[Braze test send]
  testsend --> eoa[EOA screenshots]
  eoa --> drive[Upload to Drive]
  drive --> lookup[Lookup NEWSLETTER_RUNS]
  lookup --> suspend[post_and_suspend]
  suspend -->|$.flow.suspend timeoutMs| paused((Suspended))
  paused -->|Approve click| resumeA[apply_decision: APPROVED]
  paused -->|Reject click| resumeR[apply_decision: REJECTED]
  paused -->|Timeout at T-10m| resumeT[apply_decision: TIMEOUT]

  resumeR --> clear[Braze PATCH meta clear AI]
  resumeT --> clear
  clear --> updRun[UPDATE NEWSLETTER_RUNS]
  resumeA --> updRun

  updRun --> brazeSend[Braze sends at T-0 from catalog]
```

Timing summary:

| Time | Event |
|------|-------|
| Early morning | Scheduler runs, fans out to content-prep and proof-pipeline |
| Early morning | Content-prep locks stories + generates AI, exits |
| T-1h | Proof pipeline sends test email |
| T-50m | EOA screenshots captured, uploaded to Drive |
| T-50m | Slack approval message posted, workflow suspends |
| T-10m | Suspension times out if no click → auto-reject |
| T-0 | Braze sends the actual campaign using whatever is in the catalog |

---

## Required integrations

| Service | Purpose | Pipedream auth provision |
|---|---|---|
| Pipedream | Workflow runtime + GitHub sync | N/A |
| Braze | Sends, catalogs, messages | `apn_0WhgpWJ` (send), `apn_6LhOGA9` (catalogs) |
| Email on Acid | Screenshot QA | `apn_b6hZOVx` |
| Google Drive | Proof screenshot archive | `apn_mnh5B9x` |
| Slack | Approval UX + proof notifications | configured per workflow |
| OpenAI | AI subject/intro generation | `apn_QPhO4kd` |
| Snowflake | `MCC_RAW.MARKETING_DEV` config + history | `apn_yghdQYJ` |

---

## Snowflake schema

Tables live in `MCC_RAW.MARKETING_DEV`. DDL: [`newsletter-content-prep-p_zAC1lWL/sql/schema.sql`](newsletter-content-prep-p_zAC1lWL/sql/schema.sql).

- **`NEWSLETTER_CONFIG`** — per-newsletter config. `NEWSLETTER_KEY` must exactly match the Braze campaign or canvas name. Columns include `JSON_FEED_URL`, `BRAZE_CATALOG_ID`, `MAX_STORIES`, `SLACK_CHANNEL_ID`, `APPROVERS` (array of Slack user IDs), `AI_PROMPT_TEMPLATE`, `AI_MODEL`.
- **`NEWSLETTER_RUNS`** — one row per send. Tracks `STORIES` (VARIANT), `AI_SUBJECT`, `AI_INTRO`, `DECISION` (`PENDING`/`APPROVED`/`REJECTED`/`TIMEOUT`), `DECIDED_AT`, `FINALIZED_AT`.

Run IDs are generated by `UUID_STRING()` inside the workflow (no JS crypto dependency).

---

## Development workflow

**Auto-deploy:** Commits pushed to the `production` branch are automatically synced to Pipedream. Pipedream may push its own changes back (e.g., writing auth provision IDs into `workflow.yaml` after you connect an app in the UI) — always `git pull` before starting work.

**Connected accounts must be workspace-shared.** Private account connections cause "private auth mismatch" deployment errors on GitHub sync. If you hit this, open Pipedream → Accounts → the connected account → share with workspace.

**Entry.js pattern:**
```js
import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    someApp: { type: "app", app: "some_app" },
  },
  async run({ steps, $ }) {
    const prior = steps.previous_step.$return_value;
    // ...
  },
});
```

YAML `{{expression}}` props and `type: "action"` both work; neither was the cause of the errors earlier in this project's history (those were all symptoms of the auth mismatch issue). Use whichever pattern fits.

**Branches in Pipedream UI:** Pipedream has its own notion of branches (distinct from git branches). For most work, commit directly to `production`. If you need a staging environment, create a Pipedream branch and point it at a git feature branch.

**Debugging workflows via the REST API:**
```bash
# List recent errors for a workflow
curl -s -H "Authorization: Bearer $PIPEDREAM_API_KEY" \
  "https://api.pipedream.com/v1/workflows/p_XXXXXXX/\$errors/event_summaries?expand=event&limit=5&org_id=o_qOIvyEa" \
  | python3 -m json.tool
```

---

## Rollout status

| Workflow | Status |
|---|---|
| `email-test-api` | ✅ Production, end-to-end verified |
| `braze-render` + `braze-email-capture` | ✅ Production, end-to-end verified |
| `qc-proof-scheduler` / `qc-proof-pipeline` (classic proof path) | ✅ Pre-existing, currently inactive |
| `newsletter-content-prep` | 🚧 Scaffolded, needs Snowflake tables seeded |
| `qc-proof-pipeline` newsletter steps (`lookup_newsletter_run`, `post_and_suspend`, `apply_decision`) | 🚧 Scaffolded, disabled |

Before enabling the newsletter flow end-to-end:
1. Run the DDL at `newsletter-content-prep-p_zAC1lWL/sql/schema.sql`
2. Seed at least one pilot row in `NEWSLETTER_CONFIG`
3. Create the corresponding Braze catalog (with the `meta` row and `slot_1..N` item IDs)
4. Set the Slack approval channel on `post_and_suspend` and flip `dry_run` to false
5. Enable the `lookup_newsletter_run` / `post_and_suspend` / `apply_decision` steps in `qc-proof-pipeline/workflow.yaml`
6. Enable the `route_and_trigger` step in `qc-proof-scheduler/workflow.yaml`

---

## Smoke tests

**Email Test API:**
```bash
curl -s -X POST https://eoihl6hmsymk4tc.m.pipedream.net \
  -H "Content-Type: application/json" \
  -d '{"html_body":"<h1>Test</h1>","callback_url":"https://your-webhook-here"}'
```

**Braze Render:**
```bash
curl -s -X POST https://eov0l2spkm1h5vp.m.pipedream.net \
  -H "Content-Type: application/json" \
  -d '{"liquid":"<h1>Hi {{user.first_name|default:\"friend\"}}</h1>","callback_url":"https://your-webhook-here"}'
```

Both return `{ "status": "accepted", "subject": "..." }` immediately. Full results arrive at the callback URL within a few minutes.
