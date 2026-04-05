import crypto from "crypto";

export default defineComponent({
  async run({ steps, $ }) {
    const body = steps.trigger.event.body;

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

    const hash = crypto
      .createHash("sha256")
      .update(body.html_body)
      .digest("hex")
      .slice(0, 8);
    const subject = body.subject || `email-test_${Date.now()}_${hash}`;
    const clients = body.clients || null;

    await $.respond({
      immediate: true,
      status: 202,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted", subject }),
    });

    $.export("$summary", `Accepted test request with subject: ${subject}`);

    return {
      subject,
      html_body: body.html_body,
      callback_url: body.callback_url,
      clients,
    };
  },
});
