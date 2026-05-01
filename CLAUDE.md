# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@~/.claude/snippets/mcclatchy-stack.md
@~/.claude/snippets/pipedream.md
@~/.claude/snippets/snowflake.md

## What this repo is

Pipedream workflows for email QA, rendering, and newsletter content approval at McClatchy. Each top-level directory is one Pipedream workflow (`{workflow}-{pipedream_id}/`). Synced to a Pipedream project — **commits to `production` auto-deploy**.

## Architecture

The orchestrator is newsletter-only. The scheduler uses `PROOF_WORKFLOW_URL` from `NEWSLETTER_CONFIG` to route each newsletter to its designated orchestrator.

**Newsletter proof path:** `qc-proof-scheduler` (loads routes from Snowflake) → `proof-orchestrator` (newsletter-only: content-prep → Braze render → EOA screenshots → Drive upload → AI verification → Slack approval via `$.flow.suspend()`)

## Snowflake usage

DDL lives at `newsletter-content-prep-p_zAC1lWL/sql/schema.sql`.

- `NEWSLETTER_CONFIG` — per-newsletter settings keyed by `NEWSLETTER_KEY` (must exactly match the Braze campaign/canvas name — never derive from filenames). Includes `PROOF_WORKFLOW_URL` for DB-driven routing from the scheduler.
- `NEWSLETTER_RUNS` — one row per send, tracks stories, AI content, and approval decision.

## External services

Braze (sends + catalogs), Email on Acid (screenshots), Google Drive (proof archive), Slack (approvals + notifications), OpenAI (AI subject/intro), Snowflake (config + history). All connected via Pipedream's account system.
