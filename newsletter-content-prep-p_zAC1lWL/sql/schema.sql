-- Newsletter AI Content + Approval Workflow schema
--
-- Database/schema: MCC_RAW.MARKETING_DEV (shared with other dev CRM objects).
-- Keep entry.js table references in sync if you move these tables.

-- ----------------------------------------------------------------------------
-- NEWSLETTER_CONFIG
-- One row per newsletter. NEWSLETTER_KEY must exactly match the Braze
-- campaign name or canvas name so qc-proof-scheduler/route_and_trigger can
-- route to content-prep.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS MCC_RAW.MARKETING_DEV.NEWSLETTER_CONFIG (
  NEWSLETTER_KEY        STRING        NOT NULL,
  DISPLAY_NAME          STRING        NOT NULL,
  JSON_FEED_URL         STRING        NOT NULL,
  BRAZE_CATALOG_ID      STRING        NOT NULL,
  MAX_STORIES           NUMBER(3,0)   NOT NULL DEFAULT 5,
  SLACK_CHANNEL_ID      STRING        NOT NULL,
  APPROVERS             ARRAY,        -- array of Slack user IDs
  ENABLED               BOOLEAN       NOT NULL DEFAULT TRUE,
  AI_PROMPT_TEMPLATE    STRING,
  AI_MODEL              STRING        DEFAULT 'gpt-4o-mini',
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
-- ----------------------------------------------------------------------------
-- INSERT INTO MCC_RAW.MARKETING_DEV.NEWSLETTER_CONFIG (
--   NEWSLETTER_KEY, DISPLAY_NAME, JSON_FEED_URL, BRAZE_CATALOG_ID,
--   MAX_STORIES, SLACK_CHANNEL_ID, APPROVERS, AI_PROMPT_TEMPLATE, AI_MODEL
-- ) SELECT
--   'morning_briefing',
--   'Morning Briefing',
--   'https://example.com/feeds/morning_briefing.json',
--   'newsletter_morning_briefing',
--   5,
--   'C0123456789',
--   ARRAY_CONSTRUCT('U0ABCDEFG', 'U0HIJKLMN'),
--   NULL,
--   'gpt-4o-mini';
