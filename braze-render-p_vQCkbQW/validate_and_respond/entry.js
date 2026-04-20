import crypto from "crypto";

const DEFAULTS = {
  from_email: "test@content.mcclatchymedia.com",
  from_name: "McClatchy Test",
  braze_app_id: "3f5340d5-1868-4fc0-b783-b36dd6185ab6",
  external_user_ids: [
    "0569ea91b4216badd6252af79cf08cbf9f2524e5d9480e0f7be83e79dc9d275c",
  ],
};

export default defineComponent({
  async run({ steps, $ }) {
    const body = steps.trigger.event.body;

    if (!body.liquid) {
      await $.respond({
        immediate: true,
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "liquid is required" }),
      });
      return $.flow.exit("Missing liquid");
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

    const hash = crypto
      .createHash("sha256")
      .update(body.liquid)
      .digest("hex")
      .slice(0, 8);
    const subject = body.subject || `braze-render_${Date.now()}_${hash}`;

    // Unique key for correlating the sent email with the callback.
    // Embedded as an HTML comment so it survives Braze rendering unchanged,
    // unlike the subject which may contain Liquid that Braze resolves.
    const renderKey = `render_${Date.now()}_${hash}`;
    const taggedBody = `<!-- pipedream-render-key:${renderKey} -->${body.liquid}`;

    const from_email = body.from_email || DEFAULTS.from_email;
    const from_name = body.from_name || DEFAULTS.from_name;
    const external_user_ids =
      body.external_user_ids || DEFAULTS.external_user_ids;

    const braze_payload = {
      external_user_ids,
      messages: {
        email: {
          app_id: DEFAULTS.braze_app_id,
          subject,
          from: `${from_name} <${from_email}>`,
          body: taggedBody,
        },
      },
    };

    await $.respond({
      immediate: true,
      status: 202,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted", renderKey }),
    });

    $.export("$summary", `Accepted render request (key: ${renderKey})`);

    return {
      subject,
      renderKey,
      braze_payload,
      callback_url: body.callback_url,
    };
  },
});
