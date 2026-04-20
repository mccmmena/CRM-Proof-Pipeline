import { axios } from "@pipedream/platform";
import { simpleParser } from "mailparser";

const DEBUG_URL =
  "https://d4d4b1bae33e32bf860167b3d64346cc.m.pipedream.net";

// Minify HTML — strip comments (preserve pipedream-callback), collapse whitespace
function minifyHtml(html) {
  return html
    .replace(/<!--(?!.*?pipedream-callback).*?-->/gs, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}

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

    // Pipedream truncates body.html at 100KB. The htmlUrl S3 file is also
    // truncated. The only reliable source of full HTML is the raw MIME email
    // available at rawUrl. Fall back to body.html if rawUrl isn't available.
    let rendered_html = "";

    if (email.body?.htmlTruncated && email.rawUrl) {
      console.log("HTML truncated — parsing full content from raw MIME");
      try {
        const rawEmail = await axios($, {
          method: "GET",
          url: email.rawUrl,
          responseType: "arraybuffer",
        });
        const parsed = await simpleParser(Buffer.from(rawEmail));
        rendered_html = parsed.html || parsed.textAsHtml || "";
        console.log(`Parsed ${rendered_html.length} bytes from raw MIME`);
      } catch (e) {
        console.error("Raw MIME parse failed, falling back to body.html:", e.message);
        rendered_html = email.body?.html || "";
      }
    } else if (typeof email.body === "string") {
      rendered_html = email.body;
    } else if (email.body && typeof email.body === "object") {
      rendered_html =
        email.body.html || email.body.text || JSON.stringify(email.body);
    } else {
      rendered_html =
        email.html || email.text || email.htmlBody || email.textBody || "";
    }

    // Minify to reduce payload size through downstream HTTP hops
    const originalSize = rendered_html.length;
    rendered_html = minifyHtml(rendered_html);
    console.log(`Minified HTML: ${originalSize} → ${rendered_html.length} bytes`);

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
