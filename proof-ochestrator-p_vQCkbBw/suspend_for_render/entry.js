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
  },
  async run({ steps, $ }) {
    const email = steps.utils_rebuild_braze_message.$return_value?.email;
    if (!email?.body) {
      throw new Error("No email body from utils_rebuild_braze_message");
    }

    const { resume_url } = $.flow.suspend(10 * 60 * 1000); // 10 min

    await axios($, {
      method: "POST",
      url: this.braze_render_url,
      headers: { "Content-Type": "application/json" },
      data: {
        liquid: email.body,
        subject: email.subject,
        callback_url: resume_url,
      },
    });

    $.export("$summary", `Suspended — waiting for braze-render callback`);
    return { subject: email.subject, waiting_for: "braze_render" };
  },
});
