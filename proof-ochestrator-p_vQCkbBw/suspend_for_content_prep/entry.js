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
  },
  async run({ steps, $ }) {
    const config = steps.check_config.$return_value;
    const body = steps.trigger.event.body;

    const { resume_url } = $.flow.suspend(15 * 60 * 1000); // 15 min timeout

    await axios($, {
      method: "POST",
      url: this.content_prep_url,
      headers: { "Content-Type": "application/json" },
      data: {
        newsletter_key: config.newsletter_key,
        next_send_time: body.next_send_time,
        callback_url: resume_url,
      },
    });

    $.export("$summary", `Suspended — waiting for content-prep callback`);
    return { triggered: true, newsletter_key: config.newsletter_key };
  },
});
