// Verify Slack request signature per
// https://api.slack.com/authentication/verifying-requests-from-slack
//
// Requires: trigger with raw body access. Pipedream HTTP triggers expose the
// raw body via steps.trigger.event.body when the content-type is form-urlencoded
// (but we need the raw bytes to compute HMAC). If the trigger is parsed, we
// reconstruct the body from the parsed form — this works for Slack because
// Slack sends application/x-www-form-urlencoded with a single "payload" field.
//
// Env: SLACK_SIGNING_SECRET

import crypto from "crypto";

const MAX_DRIFT_SECONDS = 300; // 5 minutes

export default defineComponent({
  async run({ steps, $ }) {
    const secret = process.env.SLACK_SIGNING_SECRET;
    if (!secret) {
      throw new Error("SLACK_SIGNING_SECRET env var not set");
    }

    const event = steps.trigger.event;
    const headers = event.headers || {};
    const signature =
      headers["x-slack-signature"] || headers["X-Slack-Signature"];
    const timestamp =
      headers["x-slack-request-timestamp"] ||
      headers["X-Slack-Request-Timestamp"];

    if (!signature || !timestamp) {
      throw new Error("Missing Slack signature or timestamp headers");
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp, 10)) > MAX_DRIFT_SECONDS) {
      throw new Error("Slack timestamp outside acceptable drift");
    }

    // Reconstruct raw body. Pipedream may expose bodyRaw or body as object.
    // For form-urlencoded Slack payloads, reconstruct from event.body.
    let rawBody = event.bodyRaw || event.rawBody || "";
    if (!rawBody && event.body) {
      if (typeof event.body === "string") {
        rawBody = event.body;
      } else if (typeof event.body === "object") {
        // Reconstruct urlencoded form from parsed object
        rawBody = Object.entries(event.body)
          .map(
            ([k, v]) =>
              `${encodeURIComponent(k)}=${encodeURIComponent(
                typeof v === "string" ? v : JSON.stringify(v)
              )}`
          )
          .join("&");
      }
    }

    const baseString = `v0:${timestamp}:${rawBody}`;
    const mySig =
      "v0=" +
      crypto.createHmac("sha256", secret).update(baseString).digest("hex");

    const valid =
      signature.length === mySig.length &&
      crypto.timingSafeEqual(Buffer.from(mySig), Buffer.from(signature));

    if (!valid) {
      throw new Error("Slack signature mismatch");
    }

    $.export("$summary", "Slack signature verified");
    return { verified: true };
  },
});
