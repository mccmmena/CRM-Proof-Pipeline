// Process the raw config query result from the built-in Snowflake step.
// Parses FEED_SOURCES, validates, and returns a clean config object.
//
// Reads: load_config_query result (raw rows from Snowflake)
// Returns: { newsletter_key, display_name, feed_sources, braze_catalog_id,
//            max_stories, slack_channel_id, approvers, ai_prompt_template,
//            ai_model, next_send_time }

export default defineComponent({
  async run({ steps, $ }) {
    const body = steps.trigger.event.body;

    if (!body?.newsletter_key) {
      throw new Error("trigger body missing newsletter_key");
    }
    if (!body?.next_send_time) {
      throw new Error("trigger body missing next_send_time");
    }

    const next_send_time = body.next_send_time;
    const rows = steps.load_config_query.$return_value || [];

    if (rows.length === 0) {
      throw new Error(
        `No enabled NEWSLETTER_CONFIG row found for key: ${body.newsletter_key}`
      );
    }

    const row = rows[0];

    // FEED_SOURCES is a Snowflake VARIANT — may come back as string or object
    let feed_sources = row.FEED_SOURCES;
    if (typeof feed_sources === "string") {
      try {
        feed_sources = JSON.parse(feed_sources);
      } catch (e) {
        throw new Error(
          `FEED_SOURCES for ${body.newsletter_key} is not valid JSON: ${e.message}`
        );
      }
    }
    if (!Array.isArray(feed_sources) || feed_sources.length === 0) {
      throw new Error(
        `FEED_SOURCES for ${body.newsletter_key} must be a non-empty array`
      );
    }

    // Respond immediately so the caller (orchestrator) isn't blocked
    // while we do the slow work (feeds, AI, catalog upsert).
    await $.respond({ status: 202, body: JSON.stringify({ status: "accepted", newsletter_key: body.newsletter_key }) });

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
