// Runs after the delay-workflow-delay step wakes at ~T-10m.
// - Reads decision state from Pipedream Data Store
// - If not APPROVED, clears the AI fields on the Braze catalog meta row
//   and marks the NEWSLETTER_RUNS decision as TIMEOUT (conditional on
//   DECISION='PENDING' so a late user click can still win the race)
// - If APPROVED, just marks FINALIZED_AT and exits

import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    data: {
      type: "data_store",
    },
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
    const { run_id } = steps.write_run_history.$return_value;
    const { braze_catalog_id } = steps.load_config.$return_value;

    const state = await this.data.get(run_id);
    const decision = state?.decision || "PENDING";

    if (decision === "APPROVED") {
      // Just finalize the row — AI stays in catalog.
      await this.snowflake.executeQuery({
        sqlText: `
          UPDATE CRM_OPS.NEWSLETTER.NEWSLETTER_RUNS
          SET FINALIZED_AT = CURRENT_TIMESTAMP()
          WHERE RUN_ID = ?
        `,
        binds: [run_id],
      });

      await this.data.delete(run_id);
      $.export("$summary", `Run ${run_id} finalized as APPROVED`);
      return { decision: "APPROVED" };
    }

    // Not approved → clear AI from Braze catalog (idempotent)
    try {
      await axios($, {
        method: "PATCH",
        url: `https://${this.braze.$auth.instance_domain}.braze.${this.braze.$auth.region}/catalogs/${braze_catalog_id}/items`,
        headers: {
          Authorization: `Bearer ${this.braze.$auth.api_key}`,
          "Content-Type": "application/json",
        },
        data: {
          items: [
            {
              id: "meta",
              ai_subject: "",
              ai_intro: "",
            },
          ],
        },
      });
    } catch (e) {
      console.error("Braze PATCH to clear meta failed:", e.message);
    }

    // Conditional UPDATE — only sets TIMEOUT if still PENDING
    const result = await this.snowflake.executeQuery({
      sqlText: `
        UPDATE CRM_OPS.NEWSLETTER.NEWSLETTER_RUNS
        SET DECISION = 'TIMEOUT',
            FINALIZED_AT = CURRENT_TIMESTAMP()
        WHERE RUN_ID = ?
          AND DECISION = 'PENDING'
      `,
      binds: [run_id],
    });

    await this.data.delete(run_id);

    const updated = result?.rowCount || result?.numRowsUpdated || 0;
    $.export(
      "$summary",
      updated > 0
        ? `Run ${run_id} auto-rejected (TIMEOUT)`
        : `Run ${run_id} already decided — no change`
    );

    return { decision: updated > 0 ? "TIMEOUT" : "ALREADY_DECIDED" };
  },
});
