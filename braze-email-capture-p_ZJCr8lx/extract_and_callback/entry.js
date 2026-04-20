import { axios } from "@pipedream/platform";

const DEBUG_URL =
  "https://d4d4b1bae33e32bf860167b3d64346cc.m.pipedream.net";

export default defineComponent({
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
    // It may be a string (HTML/text) or an object with html/text fields.
    // When the HTML exceeds Pipedream's 100KB limit, body.htmlTruncated is
    // set and body.htmlUrl contains a pre-signed S3 URL with the full content.
    let rendered_html = "";
    if (typeof email.body === "string") {
      rendered_html = email.body;
    } else if (email.body && typeof email.body === "object") {
      if (email.body.htmlTruncated && email.body.htmlUrl) {
        console.log("HTML truncated — fetching full content from htmlUrl");
        rendered_html = await axios($, {
          method: "GET",
          url: email.body.htmlUrl,
          responseType: "text",
        });
      } else {
        rendered_html =
          email.body.html || email.body.text || JSON.stringify(email.body);
      }
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

    // Extract the callback URL from the HTML comment injected by braze-render
    const callbackMatch = rendered_html.match(/<!-- pipedream-callback:(.+?) -->/);
    const callback_url = callbackMatch?.[1];

    if (!callback_url) {
      $.export("$summary", `No callback URL found in email body`);
      return $.flow.exit("No callback URL in body");
    }

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

    $.export("$summary", `Posted rendered HTML for "${subject}" to callback`);

    return { callback_status: "delivered", subject };
  },
});
