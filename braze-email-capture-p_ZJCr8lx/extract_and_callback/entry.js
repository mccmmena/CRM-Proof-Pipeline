import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    data: {
      type: "data_store",
    },
  },
  async run({ steps, $ }) {
    const email = steps.trigger.event;
    const subject = email.subject || "";
    const rendered_html = email.html || email.text || "";

    if (!subject) {
      $.export("$summary", "No subject found in email, skipping");
      return $.flow.exit("No subject");
    }

    const entry = await this.data.get(subject);

    if (!entry || !entry.callback_url) {
      $.export(
        "$summary",
        `No callback registered for subject: ${subject}`
      );
      return $.flow.exit("No callback found");
    }

    const { callback_url } = entry;

    const response = await axios($, {
      method: "POST",
      url: callback_url,
      headers: { "Content-Type": "application/json" },
      data: {
        status: "rendered",
        subject,
        rendered_html,
      },
    });

    // Clean up the data store entry
    await this.data.delete(subject);

    $.export("$summary", `Posted rendered HTML for "${subject}" to callback`);

    return { callback_status: "delivered", subject };
  },
});
