// If the decision was REJECT and write_decision actually won the race,
// immediately clear the AI fields on the Braze catalog meta row.
//
// On APPROVE or on a lost race, this is a no-op.

import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    braze: {
      type: "app",
      app: "braze",
    },
    snowflake: {
      type: "app",
      app: "snowflake",
    },
  },
  async run({ steps, $ }) {
    const { decision, run_id } = steps.parse_payload.$return_value;
    const { applied } = steps.write_decision.$return_value;

    if (!applied) {
      $.export("$summary", "Not applied (lost race), skipping Braze PATCH");
      return { skipped: true, reason: "race_lost" };
    }

    if (decision !== "REJECT") {
      $.export("$summary", "Decision is not REJECT, no Braze changes");
      return { skipped: true, reason: "not_reject" };
    }

    // Look up the catalog ID from the run/config
    const result = await this.snowflake.executeQuery({
      sqlText: `
        SELECT c.BRAZE_CATALOG_ID
        FROM CRM_OPS.NEWSLETTER.NEWSLETTER_RUNS r
        JOIN CRM_OPS.NEWSLETTER.NEWSLETTER_CONFIG c
          ON c.NEWSLETTER_KEY = r.NEWSLETTER_KEY
        WHERE r.RUN_ID = ?
      `,
      binds: [run_id],
    });
    const catalog_id = result?.rows?.[0]?.BRAZE_CATALOG_ID;
    if (!catalog_id) {
      throw new Error(`No catalog_id found for run ${run_id}`);
    }

    await axios($, {
      method: "PATCH",
      url: `https://${this.braze.$auth.instance_domain}.braze.${this.braze.$auth.region}/catalogs/${catalog_id}/items`,
      headers: {
        Authorization: `Bearer ${this.braze.$auth.api_key}`,
        "Content-Type": "application/json",
      },
      data: {
        items: [{ id: "meta", ai_subject: "", ai_intro: "" }],
      },
    });

    $.export("$summary", `Cleared AI fields in catalog ${catalog_id}`);
    return { cleared: true, catalog_id };
  },
});
