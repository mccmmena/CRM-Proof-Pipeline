// Post a thread reply on the original proof message with the decision
// outcome (approved / rejected / timed out).
//
// Uses a custom code step rather than the built-in slack_v2-reply action
// because we need a dynamic channel from the prior step's return value.

import { axios } from "@pipedream/platform";

const STATUS_TEXT = {
  APPROVED: ":white_check_mark: *Approved* — AI content will be used at send time.",
  REJECTED: ":x: *Rejected* — AI content cleared, defaults will be used.",
  TIMEOUT: ":hourglass: *Timed out* — AI content cleared, defaults will be used.",
};

export default defineComponent({
  props: {
    slack: {
      type: "app",
      app: "slack",
    },
    decision: {
      type: "string",
      label: "Decision",
    },
    channel: {
      type: "string",
      label: "Slack Channel ID",
    },
    threadTs: {
      type: "string",
      label: "Thread Timestamp",
    },
  },
  async run({ $ }) {
    const text = STATUS_TEXT[this.decision] || `:question: Unknown decision: ${this.decision}`;

    const response = await axios($, {
      method: "POST",
      url: "https://slack.com/api/chat.postMessage",
      headers: {
        Authorization: `Bearer ${this.slack.$auth.oauth_access_token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      data: {
        channel: this.channel,
        thread_ts: this.threadTs,
        text,
      },
    });

    if (!response.ok) {
      console.error("Slack reply failed:", response.error);
    }

    $.export("$summary", `Notified: ${this.decision}`);
    return { notified: response.ok };
  },
});
