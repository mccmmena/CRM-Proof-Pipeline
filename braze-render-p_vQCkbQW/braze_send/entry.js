import { axios } from "@pipedream/platform";

export default defineComponent({
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
      url: `https://${this.braze.$auth.instance_domain}.braze.${this.braze.$auth.region}/messages/send`,
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
