// Suspend and POST to content-prep.
// Content-prep will POST results to resume_url when done.

import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
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
  },
});
