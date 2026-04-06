// Process the config query result from the built-in Snowflake step.
// Returns the config row if found, or null if not a newsletter.

export default defineComponent({
  async run({ steps, $ }) {
    const body = steps.trigger.event.body;
    const campaignName = body.name || body.campaign_name || body.canvas_name;

    if (!campaignName) {
      $.export("$summary", "No campaign name in trigger body — skipping config lookup");
      return null;
    }

    const rows = steps.check_config_query.$return_value || [];
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
