// Suspend and POST to content-prep.
// Content-prep will POST results to resume_url when done.

import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    slack: {
      type: "app",
      app: "slack",
    },
    alert_channel: {
      type: "string",
      label: "Error Alert Channel ID",
    },
    content_prep_url: {
      type: "string",
      label: "Newsletter Content Prep Workflow URL",
      description: "HTTP trigger URL for newsletter-content-prep workflow",
    },
    newsletterKey: {
      type: "string",
      label: "Newsletter Key",
    },
    nextSendTime: {
      type: "string",
      label: "Next Send Time",
    },
  },
  async run({ $ }) {
   try {
    const { resume_url, cancel_url } = $.flow.suspend(15 * 60 * 1000); // 15 min timeout

    await axios($, {
      method: "POST",
      url: this.content_prep_url,
      headers: { "Content-Type": "application/json" },
      data: {
        newsletter_key: this.newsletterKey,
        next_send_time: this.nextSendTime,
        callback_url: resume_url,
      },
    });

    $.export("$summary", `Suspended — waiting for content-prep callback`);
    return { triggered: true, newsletter_key: this.newsletterKey, cancel_url };
   } catch (err) {
    try {
      await axios($, {
        method: "POST",
        url: "https://slack.com/api/chat.postMessage",
        headers: {
          Authorization: `Bearer ${this.slack.$auth.oauth_access_token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        data: {
          channel: this.alert_channel,
          text: `:rotating_light: *Proof Orchestrator* failed in \`suspend_for_content_prep\`\n> ${err.message}`,
        },
      });
    } catch (slackErr) {
      console.error("Slack alert failed:", slackErr.message);
    }
    throw err;
   }
  },
});
