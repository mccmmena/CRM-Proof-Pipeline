import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Email on Acid Get Results",
  version: "0.0.1",
  key: "eoa-get-results",
  description:
    "Retrieves screenshot URLs and full results from an Email on Acid test. Optionally filters by client keys.",
  type: "action",
  props: {
    email_on_acid: {
      type: "app",
      app: "email_on_acid",
    },
    testId: {
      type: "string",
      label: "Test ID",
      description: "The unique ID of the Email on Acid test.",
    },
    clientKeys: {
      type: "string[]",
      label: "Client Keys",
      description:
        "Optional: A list of client keys (e.g., 'iphone14_16', 'outlook19'). If provided, only results for these clients are returned.",
      optional: true,
    },
  },
  async run({ $ }) {
    const auth = Buffer.from(
      `${this.email_on_acid.$auth.api_key}:${this.email_on_acid.$auth.account_password}`
    ).toString("base64");

    const response = await axios($, {
      method: "GET",
      url: `https://api.emailonacid.com/v5/email/tests/${this.testId}/results`,
      headers: { Authorization: `Basic ${auth}` },
    });

    const isFiltering = this.clientKeys && this.clientKeys.length > 0;

    if (isFiltering) {
      const missingKeys = this.clientKeys.filter((key) => !response[key]);
      if (missingKeys.length > 0) {
        console.log(
          `Warning: Some client keys were not found: ${missingKeys.join(", ")}`
        );
      }
    }

    const screenshots = Object.entries(response || {})
      .filter(([client]) => !isFiltering || this.clientKeys.includes(client))
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
      `Retrieved ${screenshots.length} screenshot URLs for test ${this.testId}`
    );

    return {
      testId: this.testId,
      screenshots,
      fullResults: response,
    };
  },
});
