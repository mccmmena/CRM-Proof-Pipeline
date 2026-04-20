// Process the config query result from the built-in Snowflake step.
// This workflow is newsletter-only — missing config means a routing error.

export default defineComponent({
  async run({ steps, $ }) {
    const body = steps.trigger.event.body;
    const campaignName = body.name || body.campaign_name || body.canvas_name;

    if (!campaignName) {
      throw new Error("No campaign name in trigger body — cannot look up newsletter config");
    }

    const rows = steps.check_config_query.$return_value || [];
    if (rows.length === 0) {
      throw new Error(
        `No enabled NEWSLETTER_CONFIG row for "${campaignName}" — this workflow requires newsletter config`
      );
    }

    const row = rows[0];
    $.export("$summary", `Found config for "${row.NEWSLETTER_KEY}"`);
    return {
      newsletter_key: row.NEWSLETTER_KEY,
      display_name: row.DISPLAY_NAME,
      braze_catalog_id: row.BRAZE_CATALOG_ID,
      slack_channel_id: row.SLACK_CHANNEL_ID,
    };
  },
});
