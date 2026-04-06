// Always POST the full Braze item to qc-proof-pipeline.
// Runs for every campaign — newsletter or not.

import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    proof_pipeline_url: {
      type: "string",
      label: "Proof Pipeline Workflow URL",
      description: "HTTP trigger URL for qc-proof-pipeline",
    },
  },
  async run({ steps, $ }) {
    const body = steps.trigger.event.body;
    const campaignName = body.name || body.campaign_name || body.canvas_name || "unknown";

    await axios($, {
      method: "POST",
      url: this.proof_pipeline_url,
      headers: { "Content-Type": "application/json" },
      data: body,
    });

    $.export("$summary", `Triggered proof pipeline for "${campaignName}"`);
    return { triggered: true, campaign: campaignName };
  },
});
