// Read rendered HTML from the braze-render resume data, then suspend
// and POST to email-test-api for screenshots.
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
    renderedHtml: {
      type: "string",
      label: "Rendered HTML",
      description: "From braze-render resume data",
    },
  },
  async run({ $ }) {
    if (!this.renderedHtml) {
      throw new Error("No rendered_html — braze-render callback may have failed");
    }

    const { resume_url } = $.flow.suspend(20 * 60 * 1000); // 20 min

    await axios($, {
      method: "POST",
      url: this.email_test_api_url,
      headers: { "Content-Type": "application/json" },
      data: {
        html_body: this.renderedHtml,
        callback_url: resume_url,
      },
    });

    $.export("$summary", `Suspended — waiting for email-test-api callback`);
    return { rendered_html: this.renderedHtml, waiting_for: "email_test_api" };
  },
});
