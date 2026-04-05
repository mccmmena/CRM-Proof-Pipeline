import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Braze Send Inline Email",
  version: "0.0.2",
  key: "braze-send-inline",
  description:
    "Sends an email with inline HTML/Liquid content via the Braze /messages/send endpoint.",
  type: "action",
  props: {
    braze: {
      type: "app",
      app: "braze",
    },
  },
  async run({ steps, $ }) {
    const payload = steps.validate_and_respond.$return_value.braze_payload;

    const response = await axios($, {
      method: "POST",
      url: `${this.braze.$auth.rest_api_base_url}/messages/send`,
      headers: {
        Authorization: `Bearer ${this.braze.$auth.api_key}`,
        "Content-Type": "application/json",
      },
      data: payload,
    });

    $.export(
      "$summary",
      `Braze send complete — dispatch_id: ${response.dispatch_id || "N/A"}`
    );

    return response;
  },
});
