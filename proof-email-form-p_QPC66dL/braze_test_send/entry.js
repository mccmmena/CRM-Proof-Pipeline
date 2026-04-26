// Send a one-off proof email via Braze /campaigns/trigger/send.
//
// Uses an API-triggered "Proof Email Container" campaign in Braze whose
// Liquid template injects body/subject/preheader from api_trigger_properties.
// Recipient is targeted by email directly with prioritization ["unidentified"]
// — no Braze user record is created.
//
// The campaign in Braze should have Liquid like:
//   Subject:   {{api_trigger_properties.${subject}}}
//   Preheader: {{api_trigger_properties.${preheader}}}
//   Body:      {{api_trigger_properties.${body}}}
//
// Earlier attempts used /messages/send with recipients[] — that endpoint does
// not support direct email targeting (only external_user_ids/user_aliases at
// the top level), so requests failed with "Missing recipients".

import { axios } from "@pipedream/platform";

const PROOF_CAMPAIGN_ID = "fc62d530-361a-4352-aba9-1589c793be48";

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
    const subject = `[PROOF] ${this.emailSubject || this.displayName}`;

    const payload = {
      campaign_id: PROOF_CAMPAIGN_ID,
      trigger_properties: {
        body: this.emailBody,
        subject,
        preheader: this.emailPreheader || "",
      },
      recipients: [
        {
          email: this.recipientEmail,
          prioritization: ["unidentified"],
        },
      ],
    };

    const { instance_domain, region, api_key } = this.braze.$auth;
    const response = await axios($, {
      method: "POST",
      url: `https://${instance_domain}.braze.${region}/campaigns/trigger/send`,
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

    return { dispatch_id: response.dispatch_id, campaign_id: PROOF_CAMPAIGN_ID };
  },
});
