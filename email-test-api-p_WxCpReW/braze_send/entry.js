import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Braze Send Inline Email",
  version: "0.0.1",
  key: "braze-send-inline",
  description:
    "Sends an email with inline HTML/Liquid content via the Braze /messages/send endpoint.",
  type: "action",
  props: {
    braze: {
      type: "app",
      app: "braze",
    },
    payload: {
      type: "any",
      label: "Braze Payload",
      description:
        "The /messages/send payload with external_user_ids and messages.email",
    },
  },
  async run({ $ }) {
    const response = await axios($, {
      method: "POST",
      url: `${this.braze.$auth.rest_api_base_url}/messages/send`,
      headers: {
        Authorization: `Bearer ${this.braze.$auth.api_key}`,
        "Content-Type": "application/json",
      },
      data: this.payload,
    });

    $.export(
      "$summary",
      `Braze send complete — dispatch_id: ${response.dispatch_id || "N/A"}`
    );

    return response;
  },
});
