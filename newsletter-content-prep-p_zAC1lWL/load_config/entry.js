// Load newsletter configuration from Snowflake
// Reads NEWSLETTER_CONFIG by newsletter_key (campaign/canvas name from scheduler)
//
// Expects trigger body: { newsletter_key, next_send_time }
//
// Returns: { newsletter_key, display_name, feed_sources, braze_catalog_id,
//            max_stories, slack_channel_id, approvers, ai_prompt_template,
//            ai_model, next_send_time }
//
// feed_sources is an array of { url, count, label? } — see fetch_feed.

export default defineComponent({
  props: {
    snowflake: {
      type: "app",
      app: "snowflake",
    },
  },
  async run({ steps, $ }) {
    const body = steps.trigger.event.body;

    if (!body?.newsletter_key) {
      throw new Error("trigger body missing newsletter_key");
    }
    if (!body?.next_send_time) {
      throw new Error("trigger body missing next_send_time");
    }

    const newsletter_key = body.newsletter_key;
    const next_send_time = body.next_send_time;

    // TODO: verify database.schema matches production setup
    const sql = `
      SELECT
        NEWSLETTER_KEY,
        DISPLAY_NAME,
        FEED_SOURCES,
        BRAZE_CATALOG_ID,
        MAX_STORIES,
        SLACK_CHANNEL_ID,
        APPROVERS,
        AI_PROMPT_TEMPLATE,
        AI_MODEL,
        ENABLED
      FROM MCC_RAW.MARKETING_DEV.NEWSLETTER_CONFIG
      WHERE NEWSLETTER_KEY = ?
        AND ENABLED = TRUE
      LIMIT 1
    `;

    const result = await this.snowflake.executeQuery({
      sqlText: sql,
      binds: [newsletter_key],
    });

    const rows = result?.rows || [];
    if (rows.length === 0) {
      throw new Error(
        `No enabled NEWSLETTER_CONFIG row found for key: ${newsletter_key}`
      );
    }

    const row = rows[0];

    // FEED_SOURCES is a Snowflake VARIANT — the snowflake-sdk driver returns
    // VARIANT values as strings of JSON, so parse defensively. If it's
    // already an array/object (some drivers auto-parse), pass it through.
    let feed_sources = row.FEED_SOURCES;
    if (typeof feed_sources === "string") {
      try {
        feed_sources = JSON.parse(feed_sources);
      } catch (e) {
        throw new Error(
          `FEED_SOURCES for ${newsletter_key} is not valid JSON: ${e.message}`
        );
      }
    }
    if (!Array.isArray(feed_sources) || feed_sources.length === 0) {
      throw new Error(
        `FEED_SOURCES for ${newsletter_key} must be a non-empty array`
      );
    }

    const config = {
      newsletter_key: row.NEWSLETTER_KEY,
      display_name: row.DISPLAY_NAME,
      feed_sources,
      braze_catalog_id: row.BRAZE_CATALOG_ID,
      max_stories: row.MAX_STORIES || 5,
      slack_channel_id: row.SLACK_CHANNEL_ID,
      approvers: row.APPROVERS || [],
      ai_prompt_template: row.AI_PROMPT_TEMPLATE || null,
      ai_model: row.AI_MODEL || "gpt-5.4-mini",
      next_send_time,
    };

    $.export("$summary", `Loaded config for ${config.display_name}`);
    return config;
  },
});
