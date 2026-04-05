// Update the original Slack approval message via response_url (chat.update).
// Replaces the action block with a status line.
//
// Disabled by default for safety. Enable after Slack interactivity URL is
// registered and we're confident in the flow.

import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    dry_run: {
      type: "boolean",
      label: "Dry Run (don't update Slack)",
      default: true,
    },
  },
  async run({ steps, $ }) {
    const {
      decision,
      user_id,
      response_url,
    } = steps.parse_payload.$return_value;
    const { applied } = steps.write_decision.$return_value;

    const statusText = applied
      ? decision === "APPROVE"
        ? `:white_check_mark: Approved by <@${user_id}> — AI content will be used`
        : `:x: Rejected by <@${user_id}> — template will use defaults`
      : `:warning: Already decided — your click did not take effect`;

    const payload = {
      replace_original: true,
      text: statusText,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: statusText },
        },
      ],
    };

    if (this.dry_run || !response_url) {
      $.export(
        "$summary",
        `DRY RUN — would update Slack message with: ${statusText}`
      );
      return { updated: false, dry_run: true, payload };
    }

    await axios($, {
      method: "POST",
      url: response_url,
      headers: { "Content-Type": "application/json" },
      data: payload,
    });

    $.export("$summary", `Updated Slack message with status`);
    return { updated: true };
  },
});
