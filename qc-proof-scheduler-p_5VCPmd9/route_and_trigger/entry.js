// For each filtered Braze scheduled item, route to the correct downstream
// workflow(s):
//   1. If the item's name matches a row in NEWSLETTER_CONFIG, POST to the
//      newsletter-content-prep workflow (with newsletter_key + next_send_time).
//   2. Always POST to the proof pipeline (existing behavior).
//
// Reads: steps.utils_filter_by_tags.$return_value (filtered items array)
// Props: content_prep_url, proof_pipeline_url, snowflake
//
// The per-item behavior is fire-and-forget; content-prep and proof pipeline
// handle their own delays internally.

import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    snowflake: {
      type: "app",
      app: "snowflake",
    },
    content_prep_url: {
      type: "string",
      label: "Newsletter Content Prep URL",
      description: "HTTP trigger URL for newsletter-content-prep workflow",
    },
    proof_pipeline_url: {
      type: "string",
      label: "Proof Pipeline URL",
      description: "HTTP trigger URL for qc-proof-pipeline workflow",
    },
  },
  async run({ steps, $ }) {
    const items = steps.utils_filter_by_tags?.$return_value;
    if (!Array.isArray(items)) {
      throw new Error("Expected steps.utils_filter_by_tags.$return_value to be an array");
    }

    // Load all enabled newsletter keys once up front
    const configResult = await this.snowflake.executeQuery({
      sqlText: `
        SELECT NEWSLETTER_KEY
        FROM CRM_OPS.NEWSLETTER.NEWSLETTER_CONFIG
        WHERE ENABLED = TRUE
      `,
    });
    const newsletterKeys = new Set(
      (configResult?.rows || []).map((r) => r.NEWSLETTER_KEY)
    );

    let proofSuccess = 0;
    let proofFail = 0;
    let prepTriggered = 0;
    let prepFail = 0;

    for (const item of items) {
      const key = item.name || item.campaign_name || item.canvas_name;
      const nextSendTime = item.next_send_time;

      // Route 1: newsletter content prep (if configured)
      if (key && newsletterKeys.has(key)) {
        try {
          await axios($, {
            method: "POST",
            url: this.content_prep_url,
            data: {
              newsletter_key: key,
              next_send_time: nextSendTime,
            },
          });
          prepTriggered++;
        } catch (e) {
          console.error(`content-prep trigger failed for ${key}:`, e.message);
          prepFail++;
        }
      }

      // Route 2: proof pipeline (always, existing behavior)
      try {
        await axios($, {
          method: "POST",
          url: this.proof_pipeline_url,
          data: item,
        });
        proofSuccess++;
      } catch (e) {
        console.error(`proof pipeline trigger failed:`, e.message);
        proofFail++;
      }
    }

    $.export(
      "$summary",
      `Proof: ${proofSuccess}/${items.length} ok. Content-prep: ${prepTriggered} triggered${prepFail ? `, ${prepFail} failed` : ""}.`
    );

    return {
      total: items.length,
      proof_success: proofSuccess,
      proof_fail: proofFail,
      prep_triggered: prepTriggered,
      prep_fail: prepFail,
    };
  },
});
