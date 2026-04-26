// Send a one-off proof email via Braze.
//
// Two-call flow:
//   1) POST /users/track to upsert a user with external_id "proof-test-{hash}"
//      and the requester's email as an attribute.
//   2) POST /messages/send with external_user_ids:[that id] and the full
//      rendered email inline in messages.email.body.
//
// Why two calls: /messages/send requires the recipient to already exist in
// Braze and does not support direct email targeting. /campaigns/trigger/send
// does support direct email but caps trigger_properties at ~50KB — newsletter
// HTML routinely exceeds that ("'trigger_properties' is too large").
//
// The external_id is deterministic on the lowercased email, so repeat
// requests reuse the same Braze user record. The "proof-test-" prefix makes
// these test users easy to filter or delete later.

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
    const { instance_domain, region, api_key } = this.braze.$auth;
    const baseURL = `https://${instance_domain}.braze.${region}`;
    const headers = {
      Authorization: `Bearer ${api_key}`,
      "Content-Type": "application/json",
    };

    const emailHash = crypto
      .createHash("sha256")
      .update(this.recipientEmail.toLowerCase())
      .digest("hex")
      .slice(0, 16);
    const externalUserId = `proof-test-${emailHash}`;

    // 1) Upsert the user so /messages/send can target them.
    await axios($, {
      method: "POST",
      url: `${baseURL}/users/track`,
      headers,
      data: {
        attributes: [
          {
            external_id: externalUserId,
            email: this.recipientEmail,
            _update_existing_only: false,
          },
        ],
      },
    });

    // 2) Send the rendered email inline.
    const subject = `[PROOF] ${this.emailSubject || this.displayName}`;
    const emailMessage = {
      app_id: APP_ID,
      subject,
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      body: this.emailBody,
    };
    if (this.emailPreheader) emailMessage.preheader = this.emailPreheader;

    const response = await axios($, {
      method: "POST",
      url: `${baseURL}/messages/send`,
      headers,
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
