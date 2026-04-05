// Load newsletter configuration from Snowflake
// Reads NEWSLETTER_CONFIG by newsletter_key (campaign/canvas name from scheduler)
//
// Expects trigger body: { newsletter_key, next_send_time }
//
// Returns: { newsletter_key, display_name, json_feed_url, braze_catalog_id,
//            max_stories, slack_channel_id, approvers, ai_prompt_template,
//            ai_model, next_send_time }

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
        JSON_FEED_URL,
        BRAZE_CATALOG_ID,
        MAX_STORIES,
        SLACK_CHANNEL_ID,
        APPROVERS,
        AI_PROMPT_TEMPLATE,
        AI_MODEL,
        ENABLED
      FROM CRM_OPS.NEWSLETTER.NEWSLETTER_CONFIG
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
    const config = {
      newsletter_key: row.NEWSLETTER_KEY,
      display_name: row.DISPLAY_NAME,
      json_feed_url: row.JSON_FEED_URL,
      braze_catalog_id: row.BRAZE_CATALOG_ID,
      max_stories: row.MAX_STORIES || 5,
      slack_channel_id: row.SLACK_CHANNEL_ID,
      approvers: row.APPROVERS || [],
      ai_prompt_template: row.AI_PROMPT_TEMPLATE || null,
      ai_model: row.AI_MODEL || "gpt-4o-mini",
      next_send_time,
    };

    $.export("$summary", `Loaded config for ${config.display_name}`);
    return config;
  },
});
