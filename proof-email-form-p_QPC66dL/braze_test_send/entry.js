// Send a one-off proof email via Braze /messages/send.
//
// Assumes the recipient already exists in our Braze environment with an
// external_id equal to sha256(lowercased email). This is McClatchy's standard
// user-id hashing scheme — same pattern used by braze-render's default test
// user. Lookup is deterministic; no /users/track call needed (we don't have
// permissions to that endpoint anyway).

import { axios } from "@pipedream/platform";
import crypto from "crypto";

const APP_ID = "3f5340d5-1868-4fc0-b783-b36dd6185ab6";
const FROM_EMAIL = "test@content.mcclatchymedia.com";
const FROM_NAME = "McClatchy Test";

export default defineComponent({
  props: {
    braze: { type: "app", app: "braze" },
    recipientEmail: { type: "string" },
    displayName: { type: "string" },
    emailBody: { type: "string" },
    emailSubject: { type: "string", optional: true },
    emailPreheader: { type: "string", optional: true },
  },
  async run({ $ }) {
    const externalUserId = crypto
      .createHash("sha256")
      .update(this.recipientEmail.toLowerCase())
      .digest("hex");

    const subject = `[PROOF] ${this.emailSubject || this.displayName}`;
    const emailMessage = {
      app_id: APP_ID,
      subject,
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      body: this.emailBody,
    };
    if (this.emailPreheader) emailMessage.preheader = this.emailPreheader;

    const { instance_domain, region, api_key } = this.braze.$auth;
    const response = await axios($, {
      method: "POST",
      url: `https://${instance_domain}.braze.${region}/messages/send`,
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json",
      },
      data: {
        external_user_ids: [externalUserId],
        messages: { email: emailMessage },
      },
    });

    $.export(
      "$summary",
      `Sent "${this.displayName}" to ${this.recipientEmail} — dispatch_id: ${response.dispatch_id || "N/A"}`
    );

    return { dispatch_id: response.dispatch_id, external_user_id: externalUserId };
  },
});
