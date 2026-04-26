// Send a one-off proof email via Braze /messages/send.
//
// Recipient is identified by a deterministic external_user_id derived from the
// requester's email (`proof-test-{sha8(email)}`). Combined with
// `send_to_existing_only: false` and `attributes.email`, Braze creates the user
// on the fly with that email and sends to it. Same email always maps to the
// same external_user_id, so repeated requests reuse the same user record. The
// `proof-test-` prefix makes these users easy to identify or clean up later.
//
// Note: an earlier version used user_alias with send_to_existing_only:false,
// which fails with "Missing recipients" — aliases must already exist; the
// auto-create path only works with external_user_id.

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
    const emailHash = crypto
      .createHash("sha256")
      .update(this.recipientEmail.toLowerCase())
      .digest("hex")
      .slice(0, 16);
    const externalUserId = `proof-test-${emailHash}`;

    const subject = `[PROOF] ${this.emailSubject || this.displayName}`;

    const emailMessage = {
      app_id: APP_ID,
      subject,
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      body: this.emailBody,
    };
    if (this.emailPreheader) emailMessage.preheader = this.emailPreheader;

    const payload = {
      messages: { email: emailMessage },
      recipients: [
        {
          external_user_id: externalUserId,
          attributes: { email: this.recipientEmail },
          send_to_existing_only: false,
        },
      ],
    };

    const { instance_domain, region, api_key } = this.braze.$auth;
    const response = await axios($, {
      method: "POST",
      url: `https://${instance_domain}.braze.${region}/messages/send`,
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json",
      },
      data: payload,
    });

    $.export(
      "$summary",
      `Sent "${this.displayName}" to ${this.recipientEmail} — dispatch_id: ${response.dispatch_id || "N/A"}`
    );

    return { dispatch_id: response.dispatch_id, external_user_id: externalUserId };
  },
});
