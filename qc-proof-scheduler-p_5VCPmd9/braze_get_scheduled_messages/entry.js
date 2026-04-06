// Get upcoming scheduled Braze campaigns and canvases.
// Fixed copy of @mcclatchy/braze-get-scheduled-messages@0.0.1
// (original had typo: intance_domain → instance_domain)

import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    braze: {
      type: "app",
      app: "braze",
    },
    endTime: {
      type: "string",
      label: "End Time",
      description:
        "ISO-8601 string. Retrieves all scheduled messages between now and this time.",
    },
  },
  async run({ steps, $ }) {
    const {
      instance_domain: instanceDomain,
      region,
      api_key: apiKey,
    } = this.braze.$auth;

    const baseURL = `https://${instanceDomain}.braze.${region}`;

    const response = await axios($, {
      method: "GET",
      baseURL,
      url: "/messages/scheduled_broadcasts",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      params: {
        end_time: this.endTime,
      },
    });

    const broadcasts = response.scheduled_broadcasts || [];
    $.export(
      "$summary",
      `Retrieved ${broadcasts.length} scheduled messages`
    );
    return broadcasts;
  },
});
