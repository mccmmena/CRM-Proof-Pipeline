// Look up NEWSLETTER_CONFIG for the incoming campaign name.
// Returns the config row if found (enabled), or null if not a newsletter.

export default defineComponent({
  props: {
    snowflake: {
      type: "app",
      app: "snowflake",
    },
  },
  async run({ steps, $ }) {
    const body = steps.trigger.event.body;
    const campaignName = body.name || body.campaign_name || body.canvas_name;

    if (!campaignName) {
      $.export("$summary", "No campaign name in trigger body — skipping config lookup");
      return null;
    }

    const result = await this.snowflake.executeQuery({
      sqlText: `
        SELECT
          NEWSLETTER_KEY,
          DISPLAY_NAME,
          FEED_SOURCES,
          BRAZE_CATALOG_ID,
          MAX_STORIES,
          SLACK_CHANNEL_ID,
          APPROVERS,
          AI_PROMPT_TEMPLATE,
          AI_MODEL
        FROM MCC_RAW.MARKETING_DEV.NEWSLETTER_CONFIG
        WHERE NEWSLETTER_KEY = ?
          AND ENABLED = TRUE
        LIMIT 1
      `,
      binds: [campaignName],
    });

    const rows = result?.rows || [];
    if (rows.length === 0) {
      console.warn(
        `No enabled NEWSLETTER_CONFIG row for "${campaignName}" — content-prep will be skipped`
      );
      $.export("$summary", `No config for "${campaignName}" — proof-only`);
      return null;
    }

    const row = rows[0];
    $.export("$summary", `Found config for "${row.NEWSLETTER_KEY}"`);
    return {
      newsletter_key: row.NEWSLETTER_KEY,
      display_name: row.DISPLAY_NAME,
      braze_catalog_id: row.BRAZE_CATALOG_ID,
    };
  },
});
