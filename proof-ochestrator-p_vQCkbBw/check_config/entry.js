// Process the config query result from the built-in Snowflake step.
// This workflow is newsletter-only — missing config means a routing error.

export default defineComponent({
  props: {
    configRows: {
      type: "any",
      label: "Config Query Rows",
    },
    campaignName: {
      type: "string",
      label: "Campaign Name",
    },
  },
  async run({ $ }) {
    if (!this.campaignName) {
      throw new Error("No campaign name in trigger body — cannot look up newsletter config");
    }

    const rows = this.configRows || [];
    if (rows.length === 0) {
      throw new Error(
        `No enabled NEWSLETTER_CONFIG row for "${this.campaignName}" — this workflow requires newsletter config`
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
