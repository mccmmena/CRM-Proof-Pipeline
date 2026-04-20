import { axios } from "@pipedream/platform";

const DEBUG_URL =
  "https://d4d4b1bae33e32bf860167b3d64346cc.m.pipedream.net";

export default defineComponent({
  props: {
    data: {
      type: "data_store",
    },
  },
  async run({ steps, $ }) {
    const email = steps.trigger.event;

    // Try multiple field paths — Pipedream email triggers use SES format
    const subject =
      email.subject ||
      email.Subject ||
      email?.mail?.commonHeaders?.subject ||
      email?.headers?.subject ||
      "";

    // Pipedream email trigger exposes parsed body at email.body
    // It may be a string (HTML/text) or an object with html/text fields
    let rendered_html = "";
    if (typeof email.body === "string") {
      rendered_html = email.body;
    } else if (email.body && typeof email.body === "object") {
      rendered_html =
        email.body.html || email.body.text || JSON.stringify(email.body);
    } else {
      rendered_html =
        email.html || email.text || email.htmlBody || email.textBody || "";
    }

    // Always POST debug info so we can see what the trigger provides
    const eventKeys = Object.keys(email || {});
    const debugPayload = {
      status: "debug",
      event_keys: eventKeys,
      subject_found: subject,
      subject_length: subject.length,
      html_length: rendered_html.length,
      // Include small sample of each field so we can identify structure
      event_sample: JSON.stringify(email).slice(0, 2000),
    };

    try {
      await axios($, {
        method: "POST",
        url: DEBUG_URL,
        headers: { "Content-Type": "application/json" },
        data: debugPayload,
      });
    } catch (e) {
      console.error("Debug POST failed:", e.message);
    }

    if (!subject) {
      $.export("$summary", `No subject in event keys: ${eventKeys.join(", ")}`);
      return $.flow.exit("No subject");
    }

    // Extract the render key from the HTML comment injected by braze-render
    const keyMatch = rendered_html.match(/<!-- pipedream-render-key:(.+?) -->/);
    const renderKey = keyMatch?.[1];

    if (!renderKey) {
      $.export("$summary", `No render key found in email body`);
      return $.flow.exit("No render key in body");
    }

    const entry = await this.data.get(renderKey);

    if (!entry || !entry.callback_url) {
      $.export(
        "$summary",
        `No callback registered for key: ${renderKey}`
      );
      return $.flow.exit("No callback found");
    }

    const { callback_url } = entry;

    await axios($, {
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
    await this.data.delete(renderKey);

    $.export("$summary", `Posted rendered HTML for "${subject}" (key: ${renderKey}) to callback`);

    return { callback_status: "delivered", subject, renderKey };
  },
});
