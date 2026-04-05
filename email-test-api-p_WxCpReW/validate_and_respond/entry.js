import crypto from "crypto";

export default defineComponent({
  name: "Validate and Respond",
  version: "0.0.1",
  key: "validate-and-respond",
  description:
    "Validates the incoming request, applies defaults, builds the Braze payload, and immediately responds 202 to free the HTTP caller.",
  type: "action",
  props: {
    trigger_body: {
      type: "any",
      label: "Trigger Body",
      description: "The HTTP request body from the trigger",
    },
    default_from_email: {
      type: "string",
      label: "Default From Email",
    },
    default_from_name: {
      type: "string",
      label: "Default From Name",
    },
    default_external_user_ids: {
      type: "string[]",
      label: "Default External User IDs",
      description: "Braze external user IDs for test recipients",
    },
    braze_app_id: {
      type: "string",
      label: "Braze App ID",
    },
  },
  async run({ $ }) {
    const body = this.trigger_body;

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

    // Apply defaults
    const from_email = body.from_email || this.default_from_email;
    const from_name = body.from_name || this.default_from_name;
    const external_user_ids =
      body.external_user_ids || this.default_external_user_ids;
    const client_keys = body.client_keys || null;

    // Build Braze /messages/send payload
    const braze_payload = {
      external_user_ids,
      messages: {
        email: {
          app_id: this.braze_app_id,
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
