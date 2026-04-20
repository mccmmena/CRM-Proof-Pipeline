// Post workflow error details to Slack.
// Triggered by $errors subscription from proof-orchestrator.

import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    slack: {
      type: "app",
      app: "slack",
    },
    channel: {
      type: "string",
      label: "Alert Channel ID",
      description: "Slack channel to post error alerts",
    },
  },
  async run({ steps, $ }) {
    const event = steps.trigger.event.body ?? steps.trigger.event;

    // Pipedream $errors events have varying shapes — extract what we can
    const stepName = event?.step?.namespace
      || event?.step_name
      || event?.original_context?.step?.namespace
      || "unknown step";
    const errorMsg = event?.error?.message
      || event?.error?.export?.error?.message
      || event?.error
      || "No error message available";
    const workflowName = event?.workflow?.name
      || event?.original_context?.workflow_name
      || "Proof Orchestrator";
    const executionId = event?.original_context?.id
      || event?.event_id
      || "";

    const inspectorUrl = executionId
      ? `https://pipedream.com/@mccmmena/projects/proj_dPsaYzx/proof-ochestrator-p_vQCkbBw/inspect?event=${executionId}`
      : "";

    const text = [
      `:rotating_light: *${workflowName}* failed in \`${stepName}\``,
      `> ${errorMsg}`,
      inspectorUrl ? `<${inspectorUrl}|View execution>` : null,
    ].filter(Boolean).join("\n");

    await axios($, {
      method: "POST",
      url: "https://slack.com/api/chat.postMessage",
      headers: {
        Authorization: `Bearer ${this.slack.$auth.oauth_access_token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      data: { channel: this.channel, text },
    });

    $.export("$summary", `Posted error alert for ${stepName}`);
  },
});
