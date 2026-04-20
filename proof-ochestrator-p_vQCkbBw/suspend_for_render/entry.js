// Suspend the workflow and POST to braze-render.
// When braze-email-capture delivers the rendered HTML to the resume_url,
// the workflow resumes and the next step reads $.context.resume.body.
//
// Timeout: 10 minutes (render should complete in 1-2 min).

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
    braze_render_url: {
      type: "string",
      label: "Braze Render Workflow URL",
      description: "HTTP trigger URL for braze-render workflow",
    },
    emailBody: {
      type: "string",
      label: "Email Body (Liquid)",
    },
    emailSubject: {
      type: "string",
      label: "Email Subject",
    },
    emailPreheader: {
      type: "string",
      label: "Email Preheader",
      optional: true,
    },
  },
  async run({ $ }) {
   try {
    if (!this.emailBody) {
      throw new Error("No email body from resolve_braze_details");
    }

    const { resume_url, cancel_url } = $.flow.suspend(10 * 60 * 1000); // 10 min

    const payload = {
      liquid: this.emailBody,
      subject: this.emailSubject,
      callback_url: resume_url,
    };
    if (this.emailPreheader) payload.preheader = this.emailPreheader;

    await axios($, {
      method: "POST",
      url: this.braze_render_url,
      headers: { "Content-Type": "application/json" },
      data: payload,
    });

    $.export("$summary", `Suspended — waiting for braze-render callback`);
    return { subject: this.emailSubject, waiting_for: "braze_render", cancel_url };
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
          text: `:rotating_light: *Proof Orchestrator* failed in \`suspend_for_render\`\n> ${err.message}`,
        },
      });
    } catch (slackErr) {
      console.error("Slack alert failed:", slackErr.message);
    }
    throw err;
   }
  },
});
