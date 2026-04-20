// Runs after suspend_and_post_proof resumes (button click or timeout).
// Extracts the decision from resume data, maps it to a final status,
// and clears AI fields from the Braze catalog on reject/timeout so the
// template falls back to defaults.
//
// The Snowflake UPDATE is handled by the next step (built-in action).

import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    braze: {
      type: "app",
      app: "braze",
    },
    config: {
      type: "any",
      label: "Newsletter Config",
    },
    runId: {
      type: "string",
      label: "Run ID",
      optional: true,
    },
    resumeData: {
      type: "any",
      label: "Resume Data from Suspend",
      optional: true,
    },
  },
  async run({ steps, $ }) {
    const config = this.config;
    const runId = this.runId || "unknown";
    const resumeData = this.resumeData || {};

    // Extract decision — try the prop (wired from $resume_data) first,
    // then fall back to runtime context paths for robustness.
    const candidates = [
      resumeData?.query?.decision,
      resumeData?.body?.decision,
      $.context?.resume?.query?.decision,
      $.context?.resume?.decision,
    ];

    let decision = null;
    for (const c of candidates) {
      if (c) {
        decision = c.toLowerCase();
        break;
      }
    }

    let finalStatus;
    if (decision === "approve") finalStatus = "APPROVED";
    else if (decision === "reject") finalStatus = "REJECTED";
    else finalStatus = "TIMEOUT";

    console.log(`Resolved decision: ${decision || "(none)"} → ${finalStatus}`);

    // On reject or timeout, clear AI fields from the shared content catalog
    // so the template falls back to defaults.
    let brazCleared = false;
    if (finalStatus !== "APPROVED") {
      try {
        await axios($, {
          method: "PATCH",
          url: `https://${this.braze.$auth.instance_domain}.braze.${this.braze.$auth.region}/catalogs/crm_newsletters_content/items`,
          headers: {
            Authorization: `Bearer ${this.braze.$auth.api_key}`,
            "Content-Type": "application/json",
          },
          data: {
            items: [{ id: config.newsletter_key, ai_subject: "", ai_intro: "" }],
          },
        });
        brazCleared = true;
      } catch (e) {
        console.error("Braze PATCH to clear meta failed:", e.message);
      }
    }

    $.export("$summary", `Decision: ${finalStatus}${brazCleared ? " (AI content cleared)" : ""}`);

    return {
      decision: finalStatus,
      run_id: runId,
      newsletter_key: config.newsletter_key,
      braze_cleared: brazCleared,
    };
  },
});
