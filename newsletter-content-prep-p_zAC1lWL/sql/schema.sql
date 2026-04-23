-- Newsletter AI Content + Approval Workflow schema
--
-- Database/schema: MCC_RAW.MARKETING_DEV (shared with other dev CRM objects).
-- Keep entry.js table references in sync if you move these tables.

-- ----------------------------------------------------------------------------
-- NEWSLETTER_CONFIG
-- One row per newsletter. NEWSLETTER_KEY must exactly match the Braze
-- canvas name (resolved via canvas details API). CANVAS_ID stores the
-- Braze canvas identifier used by the orchestrator trigger.
-- ----------------------------------------------------------------------------
-- FEED_SOURCES is an ordered array of feed specs. Each element:
--   { "url": "https://...", "count": 3, "label": "optional section name" }
-- Array order = story order in the final email. Stories are fetched from
-- each feed in turn, sliced to `count`, concatenated, and assigned
-- slot_1..slot_N. Sum of counts should equal MAX_STORIES.
CREATE TABLE IF NOT EXISTS MCC_RAW.MARKETING_DEV.NEWSLETTER_CONFIG (
  NEWSLETTER_KEY        STRING        NOT NULL,
  DISPLAY_NAME          STRING        NOT NULL,
  FEED_SOURCES          VARIANT       NOT NULL,
  BRAZE_CATALOG_ID      STRING        NOT NULL,
  MAX_STORIES           NUMBER(3,0)   NOT NULL DEFAULT 5,
  SLACK_CHANNEL_ID      STRING        NOT NULL,
  APPROVERS             ARRAY,        -- array of Slack user IDs
  ENABLED               BOOLEAN       NOT NULL DEFAULT TRUE,
  AI_PROMPT_TEMPLATE    STRING,
  AI_MODEL              STRING        DEFAULT 'gpt-5.4-mini',
  CANVAS_ID             STRING,       -- Braze canvas ID for this newsletter
  PROOF_WORKFLOW_URL    STRING,       -- HTTP trigger URL for the proof orchestrator workflow
  CREATED_AT            TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  UPDATED_AT            TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  CONSTRAINT PK_NEWSLETTER_CONFIG PRIMARY KEY (NEWSLETTER_KEY)
);

-- ----------------------------------------------------------------------------
-- NEWSLETTER_RUNS
-- One row per newsletter send. Created by newsletter-content-prep on fetch.
-- Updated by qc-slack-approval (interactivity) and finalize_decision.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS MCC_RAW.MARKETING_DEV.NEWSLETTER_RUNS (
  RUN_ID                STRING        NOT NULL,    -- UUID
  NEWSLETTER_KEY        STRING        NOT NULL,
  NEXT_SEND_TIME        TIMESTAMP_NTZ NOT NULL,
  PREP_STARTED_AT       TIMESTAMP_NTZ,
  STORIES               VARIANT,                    -- JSON array
  AI_SUBJECT            STRING,
  AI_INTRO              STRING,
  AI_INTRO_HTML         STRING,
  AI_MODEL              STRING,
  AI_RAW_RESPONSE       VARIANT,
  SLACK_CHANNEL_ID      STRING,
  SLACK_MESSAGE_TS      STRING,
  DECISION              STRING        NOT NULL DEFAULT 'PENDING',
                          -- PENDING | APPROVED | REJECTED | TIMEOUT
  DECIDED_BY            STRING,                     -- Slack user ID
  DECIDED_AT            TIMESTAMP_NTZ,
  FINALIZED_AT          TIMESTAMP_NTZ,
  CONSTRAINT PK_NEWSLETTER_RUNS PRIMARY KEY (RUN_ID),
  CONSTRAINT UQ_NEWSLETTER_RUNS_KEY_TIME UNIQUE (NEWSLETTER_KEY, NEXT_SEND_TIME)
);

-- ----------------------------------------------------------------------------
-- Example seed row for pilot testing
--
-- FEED_SOURCES is a VARIANT — use PARSE_JSON to populate it. The array can
-- contain one entry (single feed) or many (mix of feeds with per-feed counts
-- that sum to MAX_STORIES).
-- ----------------------------------------------------------------------------
-- INSERT INTO MCC_RAW.MARKETING_DEV.NEWSLETTER_CONFIG (
--   NEWSLETTER_KEY, DISPLAY_NAME, FEED_SOURCES, BRAZE_CATALOG_ID,
--   MAX_STORIES, SLACK_CHANNEL_ID, APPROVERS, AI_PROMPT_TEMPLATE, AI_MODEL,
--   CANVAS_ID, PROOF_WORKFLOW_URL, ENABLED
-- ) SELECT
--   'crm_the_trailhead_master',
--   'The Trailhead',
--   PARSE_JSON('[{"url":"https://www.newshunter.com/feed/trailhead","count":9}]'),
--   'crm_trailhead_stories',
--   9,
--   'C0123456789',
--   ARRAY_CONSTRUCT('U0ABCDEFG'),
--   NULL,
--   'gpt-5.4-mini',
--   'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',  -- Braze canvas ID
--   'https://eone5ahulwjwhb6.m.pipedream.net',
--   FALSE;
--
-- Multi-feed example (hypothetical):
-- PARSE_JSON('[
--   {"url":"https://feed-a/local.json",   "count":3, "label":"Local"},
--   {"url":"https://feed-b/sports.json",  "count":4, "label":"Sports"},
--   {"url":"https://feed-c/biz.json",     "count":5, "label":"Business"}
-- ]')
