import crypto from "crypto";

const DEFAULTS = {
  from_email: "noreply@mcclatchy.com",
  from_name: "McClatchy Test",
  braze_app_id: "3f5340d5-1868-4fc0-b783-b36dd6185ab6",
  external_user_ids: [
    "ad0e2d4700023d3462ac8a72ca9c7dfc2621bbcf83f8ffddd4f963e7c92488bb",
  ],
};

export default defineComponent({
  async run({ steps, $ }) {
    const body = steps.trigger.event.body;

    // Validate required fields
    if (!body.html_body) {
      await $.respond({
        immediate: true,
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "html_body is required" }),
      });
      return $.flow.exit("Missing html_body");
    }

    if (!body.callback_url) {
      await $.respond({
        immediate: true,
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "callback_url is required" }),
      });
      return $.flow.exit("Missing callback_url");
    }

    // Generate subject if not provided
    const hash = crypto
      .createHash("sha256")
      .update(body.html_body)
      .digest("hex")
      .slice(0, 8);
    const subject = body.subject || `liquid-test_${Date.now()}_${hash}`;

    // Apply defaults (request body can override any of these)
    const from_email = body.from_email || DEFAULTS.from_email;
    const from_name = body.from_name || DEFAULTS.from_name;
    const external_user_ids =
      body.external_user_ids || DEFAULTS.external_user_ids;
    const client_keys = body.client_keys || null;

    // Build Braze /messages/send payload
    const braze_payload = {
      external_user_ids,
      messages: {
        email: {
          app_id: DEFAULTS.braze_app_id,
          subject,
          from: `${from_name} <${from_email}>`,
          body: body.html_body,
        },
      },
    };

    // Respond immediately to free the caller
    await $.respond({
      immediate: true,
      status: 202,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted", subject }),
    });

    $.export("$summary", `Accepted test request with subject: ${subject}`);

    return {
      subject,
      braze_payload,
      callback_url: body.callback_url,
      client_keys,
    };
  },
});
