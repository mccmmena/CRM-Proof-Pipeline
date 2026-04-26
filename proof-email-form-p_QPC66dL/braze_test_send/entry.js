// Send a one-off proof email via Braze /messages/send.
//
// Recipient is overridden via the `recipients` array using a user_alias plus
// `attributes.email` and `send_to_existing_only: false`. This routes a real
// Braze send to an arbitrary email address without polluting the
// external_user_id namespace. Aliased users can be located later in Braze
// by the alias_label "proof_test".

import { axios } from "@pipedream/platform";
import crypto from "crypto";

const APP_ID = "3f5340d5-1868-4fc0-b783-b36dd6185ab6";
const FROM_EMAIL = "test@content.mcclatchymedia.com";
const FROM_NAME = "McClatchy Test";
const ALIAS_LABEL = "proof_test";

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
    const aliasName = `proof-test-${crypto
      .createHash("sha256")
      .update(this.recipientEmail.toLowerCase())
      .digest("hex")
      .slice(0, 16)}`;

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
          user_alias: { alias_name: aliasName, alias_label: ALIAS_LABEL },
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

    return { dispatch_id: response.dispatch_id, alias_name: aliasName };
  },
});
