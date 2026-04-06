// Runs after post_and_suspend resumes (either by a button click or by
// timeout). Reads the decision from the resume data and applies it:
//
//   - decision=approve → UPDATE NEWSLETTER_RUNS SET DECISION='APPROVED'
//   - decision=reject  → Braze PATCH meta row to clear AI fields,
//                        UPDATE NEWSLETTER_RUNS SET DECISION='REJECTED'
//   - no decision      → treat as TIMEOUT (auto-reject), same as reject but
//                        with DECISION='TIMEOUT'
//
// The resume data comes from the query string on the URL that was hit.
// Pipedream exposes it on the workflow event context — we inspect
// $.context.resume and steps.trigger.event to find the 'decision' param.

import { axios } from "@pipedream/platform";

function extractDecision({ steps, $ }) {
  // Try several paths — the exact shape of resume data isn't well documented
  // and may vary. We'll log the full context on first run to confirm.
  const candidates = [
    $.context?.resume?.query?.decision,
    $.context?.resume?.decision,
    $.context?.resume?.body?.decision,
    steps.trigger?.event?.query?.decision,
    steps.trigger?.event?.resume?.query?.decision,
  ];
  for (const c of candidates) {
    if (c) return c.toLowerCase();
  }
  return null;
}

export default defineComponent({
  props: {
    snowflake: {
      type: "app",
      app: "snowflake",
    },
    braze: {
      type: "app",
      app: "braze",
    },
  },
  async run({ steps, $ }) {
    const config = steps.check_config?.$return_value;
    const suspendResult = steps.post_and_suspend?.$return_value;

    // If no config or we never actually suspended (dry run / non-newsletter),
    // there's nothing to do.
    if (!config) {
      $.export("$summary", "No newsletter config — skipping");
      return { skipped: true, reason: "no_config" };
    }
    if (suspendResult?.dry_run) {
      $.export("$summary", "Dry run — not applying decision");
      return { skipped: true, reason: "dry_run" };
    }

    // Dump context for debugging until we know the exact shape
    console.log(
      "Resume context:",
      JSON.stringify({
        resume: $.context?.resume,
        trigger_query: steps.trigger?.event?.query,
      })
    );

    const decision = extractDecision({ steps, $ });
    let finalStatus;
    if (decision === "approve") finalStatus = "APPROVED";
    else if (decision === "reject") finalStatus = "REJECTED";
    else finalStatus = "TIMEOUT";

    console.log(`Resolved decision: ${decision || "(none)"} → ${finalStatus}`);

    // Build run info from check_config + post_and_suspend
    const run = {
      run_id: suspendResult?.run_id || "unknown",
      braze_catalog_id: config.braze_catalog_id,
      newsletter_key: config.newsletter_key,
    };

    // On reject or timeout, clear AI fields from Braze catalog so template
    // falls back to defaults.
    if (finalStatus !== "APPROVED") {
      try {
        await axios($, {
          method: "PATCH",
          url: `https://${this.braze.$auth.instance_domain}.braze.${this.braze.$auth.region}/catalogs/${run.braze_catalog_id}/items`,
          headers: {
            Authorization: `Bearer ${this.braze.$auth.api_key}`,
            "Content-Type": "application/json",
          },
          data: {
            items: [{ id: "meta", ai_subject: "", ai_intro: "" }],
          },
        });
      } catch (e) {
        console.error("Braze PATCH to clear meta failed:", e.message);
      }
    }

    // Update NEWSLETTER_RUNS — conditional on DECISION='PENDING' so a late
    // click can't overwrite a prior decision.
    const sql = `
      UPDATE MCC_RAW.MARKETING_DEV.NEWSLETTER_RUNS
      SET DECISION = ?,
          DECIDED_AT = CURRENT_TIMESTAMP(),
          FINALIZED_AT = CURRENT_TIMESTAMP()
      WHERE RUN_ID = ?
        AND DECISION = 'PENDING'
    `;
    const result = await this.snowflake.executeQuery({
      sqlText: sql,
      binds: [finalStatus, run.run_id],
    });

    const updated = result?.rowCount || result?.numRowsUpdated || 0;
    $.export(
      "$summary",
      updated > 0
        ? `Run ${run.run_id} → ${finalStatus}`
        : `Run ${run.run_id} already decided, no change`
    );

    return { decision: finalStatus, applied: updated > 0 };
  },
});
