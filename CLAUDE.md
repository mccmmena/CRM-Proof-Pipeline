# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Pipedream workflows for email QA, rendering, and newsletter content approval at McClatchy. Each top-level directory is a Pipedream workflow (named `{workflow}-{pipedream_id}/`). The repo is synced to a Pipedream project — **commits to `production` auto-deploy**.

## Key conventions

- **Always `git pull` before starting work.** Pipedream pushes its own changes (e.g., auth provision IDs) back to this branch.
- **Commit directly to `production`** for most work. Feature branches are only needed if you want a Pipedream staging branch.
- **No build step, no tests, no linter.** Each workflow step is an `entry.js` file using Pipedream's `defineComponent()` pattern. Validation happens by deploying to Pipedream.

## Workflow structure

Each workflow directory contains:
- `workflow.yaml` — step ordering, triggers, connected accounts, and expression props
- `{step_name}/entry.js` — individual step code using `defineComponent({ props, async run({ steps, $ }) })`

Steps access prior step outputs via `steps.previous_step.$return_value`. Steps export data via `$.export("key", value)` or `return value`.

## Architecture (the two paths)

1. **Classic proof path:** `qc-proof-scheduler` → `proof-orchestrator` → `qc-proof-pipeline` (delay → test send → EOA screenshots → Drive upload → Slack post)
2. **Newsletter path:** Same as above, but orchestrator also triggers `newsletter-content-prep` first (fetch feed → Braze catalog upsert → OpenAI subject/intro → Snowflake history), then `qc-proof-pipeline` adds approval via `$.flow.suspend()`

## Pipedream-specific patterns

- Auth is via `props` with `type: "app"` — the connected account must be **workspace-shared** or GitHub sync fails with "private auth mismatch"
- `$.flow.rerun()` for polling loops (used in EOA polling)
- `$.flow.suspend()` for async human approval (used in newsletter Slack approval)
- HTTP triggers return responses via `$.respond()`
- YAML `{{expression}}` props and `type: "action"` steps both work fine
- Debug workflow errors via the Pipedream REST API: `GET /v1/workflows/{id}/$errors/event_summaries?expand=event&limit=5&org_id=o_qOIvyEa`

## Snowflake

Tables live in `MCC_RAW.MARKETING_DEV`. DDL is at `newsletter-content-prep-p_zAC1lWL/sql/schema.sql`.
- `NEWSLETTER_CONFIG` — per-newsletter settings keyed by `NEWSLETTER_KEY` (must exactly match the Braze campaign/canvas name — never derive from filenames)
- `NEWSLETTER_RUNS` — one row per send, tracks stories, AI content, and approval decision
- Run IDs use Snowflake's `UUID_STRING()`, not JS crypto

## External services

Braze (sends + catalogs), Email on Acid (screenshots), Google Drive (proof archive), Slack (approvals + notifications), OpenAI (AI subject/intro), Snowflake (config + history). All connected via Pipedream's account system.
