// Read rendered HTML from the braze-render callback (previous suspend's
// resume data), then suspend again and POST to email-test-api.
// When email-test-api delivers screenshots to the resume_url, the
// workflow resumes and the next step reads $.context.resume.body.
//
// Timeout: 20 minutes (email-test-api polls EOA for up to 15 min).

import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    email_test_api_url: {
      type: "string",
      label: "Email Test API Workflow URL",
      description: "HTTP trigger URL for email-test-api workflow",
    },
  },
  async run({ steps, $ }) {
    // Resume data from braze-render callback
    const resumeBody = $.context?.resume?.body;
    const rendered_html = resumeBody?.rendered_html;

    if (!rendered_html) {
      console.log("Resume context:", JSON.stringify($.context?.resume, null, 2));
      throw new Error(
        "No rendered_html in resume body — braze-render callback may have failed"
      );
    }

    const subject =
      resumeBody?.subject ||
      steps.suspend_for_render?.$return_value?.subject ||
      `proof_${Date.now()}`;

    const { resume_url } = $.flow.suspend(20 * 60 * 1000); // 20 min

    await axios($, {
      method: "POST",
      url: this.email_test_api_url,
      headers: { "Content-Type": "application/json" },
      data: {
        html_body: rendered_html,
        subject,
        callback_url: resume_url,
      },
    });

    $.export("$summary", `Suspended — waiting for email-test-api callback`);
    return { subject, waiting_for: "email_test_api" };
  },
});
