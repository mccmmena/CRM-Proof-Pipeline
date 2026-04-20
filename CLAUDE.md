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

## Architecture

The orchestrator is newsletter-only. The scheduler uses `PROOF_WORKFLOW_URL` from `NEWSLETTER_CONFIG` to route each newsletter to its designated orchestrator.

**Newsletter proof path:** `qc-proof-scheduler` (loads routes from Snowflake) → `proof-orchestrator` (newsletter-only: content-prep → Braze render → EOA screenshots → Drive upload → AI verification → Slack approval via `$.flow.suspend()`)

## Pipedream-specific patterns

- Auth is via `props` with `type: "app"` — the connected account must be **workspace-shared** or GitHub sync fails with "private auth mismatch"
- `$.flow.rerun()` for polling loops (used in EOA polling)
- `$.flow.suspend()` for async human approval (used in newsletter Slack approval)
- HTTP triggers return responses via `$.respond()`
- YAML `{{expression}}` props and `type: "action"` steps both work fine
- Debug workflow errors via the Pipedream REST API: `GET /v1/workflows/{id}/$errors/event_summaries?expand=event&limit=5&org_id=o_qOIvyEa`

## Snowflake

Tables live in `MCC_RAW.MARKETING_DEV`. DDL is at `newsletter-content-prep-p_zAC1lWL/sql/schema.sql`.
- `NEWSLETTER_CONFIG` — per-newsletter settings keyed by `NEWSLETTER_KEY` (must exactly match the Braze campaign/canvas name — never derive from filenames). Includes `PROOF_WORKFLOW_URL` for DB-driven routing from the scheduler.
- `NEWSLETTER_RUNS` — one row per send, tracks stories, AI content, and approval decision
- Run IDs use Snowflake's `UUID_STRING()`, not JS crypto

## External services

Braze (sends + catalogs), Email on Acid (screenshots), Google Drive (proof archive), Slack (approvals + notifications), OpenAI (AI subject/intro), Snowflake (config + history). All connected via Pipedream's account system.
