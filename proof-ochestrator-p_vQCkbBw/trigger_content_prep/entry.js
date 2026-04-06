// If a NEWSLETTER_CONFIG match was found, POST to newsletter-content-prep.
// Skips if no config (non-newsletter proof).

import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    content_prep_url: {
      type: "string",
      label: "Newsletter Content Prep Workflow URL",
      description: "HTTP trigger URL for newsletter-content-prep",
    },
  },
  async run({ steps, $ }) {
    const config = steps.check_config.$return_value;
    const body = steps.trigger.event.body;

    if (!config) {
      $.export("$summary", "No newsletter config — skipping content-prep");
      return { triggered: false, reason: "no_config" };
    }

    const payload = {
      newsletter_key: config.newsletter_key,
      next_send_time: body.next_send_time,
    };

    await axios($, {
      method: "POST",
      url: this.content_prep_url,
      headers: { "Content-Type": "application/json" },
      data: payload,
    });

    $.export(
      "$summary",
      `Triggered content-prep for "${config.newsletter_key}"`
    );
    return { triggered: true, newsletter_key: config.newsletter_key };
  },
});
