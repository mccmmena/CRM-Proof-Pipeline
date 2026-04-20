// Suspend the workflow and POST to braze-render.
// When braze-email-capture delivers the rendered HTML to the resume_url,
// the workflow resumes and the next step reads $.context.resume.body.
//
// Timeout: 10 minutes (render should complete in 1-2 min).

import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
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
  },
  async run({ $ }) {
    if (!this.emailBody) {
      throw new Error("No email body from resolve_braze_details");
    }

    const { resume_url } = $.flow.suspend(10 * 60 * 1000); // 10 min

    await axios($, {
      method: "POST",
      url: this.braze_render_url,
      headers: { "Content-Type": "application/json" },
      data: {
        liquid: this.emailBody,
        subject: this.emailSubject,
        callback_url: resume_url,
      },
    });

    $.export("$summary", `Suspended — waiting for braze-render callback`);
    return { subject: this.emailSubject, waiting_for: "braze_render" };
  },
});
