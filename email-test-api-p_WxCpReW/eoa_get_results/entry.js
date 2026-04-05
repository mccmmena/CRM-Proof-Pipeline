import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    email_on_acid: {
      type: "app",
      app: "email_on_acid",
    },
  },
  async run({ steps, $ }) {
    const testId = steps.eoa_find_test.$return_value.testId;
    const clientKeys = steps.validate_and_respond.$return_value.client_keys;

    const auth = Buffer.from(
      `${this.email_on_acid.$auth.api_key}:${this.email_on_acid.$auth.account_password}`
    ).toString("base64");

    const response = await axios($, {
      method: "GET",
      url: `https://api.emailonacid.com/v5/email/tests/${testId}/results`,
      headers: { Authorization: `Basic ${auth}` },
    });

    const isFiltering = clientKeys && clientKeys.length > 0;

    if (isFiltering) {
      const missingKeys = clientKeys.filter((key) => !response[key]);
      if (missingKeys.length > 0) {
        console.log(
          `Warning: Some client keys were not found: ${missingKeys.join(", ")}`
        );
      }
    }

    const screenshots = Object.entries(response || {})
      .filter(([client]) => !isFiltering || clientKeys.includes(client))
      .map(([client, data]) => ({
        client,
        url: data.screenshots?.default || data.url,
      }))
      .filter((s) => s.url);

    if (isFiltering && screenshots.length === 0) {
      throw new Error(
        `None of the requested client keys were found. Available keys: ${Object.keys(response || {}).join(", ")}`
      );
    }

    $.export(
      "$summary",
      `Retrieved ${screenshots.length} screenshot URLs for test ${testId}`
    );

    return {
      testId,
      screenshots,
      fullResults: response,
    };
  },
});
