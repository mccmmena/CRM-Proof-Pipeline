import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    email_on_acid: {
      type: "app",
      app: "email_on_acid",
    },
  },
  async run({ steps, $ }) {
    const testId = steps.eoa_create_test.$return_value.testId;
    const clients = steps.validate_and_respond.$return_value.clients;

    const auth = Buffer.from(
      `${this.email_on_acid.$auth.api_key}:${this.email_on_acid.$auth.account_password}`
    ).toString("base64");

    const maxAttempts = 10;
    const pollDelayMs = 30000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await axios($, {
        method: "GET",
        url: `https://api.emailonacid.com/v5/email/tests/${testId}/results`,
        headers: { Authorization: `Basic ${auth}` },
      });

      const entries = Object.entries(response || {});
      const hasScreenshots = entries.some(
        ([, data]) => data.screenshots?.default || data.url
      );

      if (hasScreenshots) {
        const isFiltering = clients && clients.length > 0;

        const screenshots = entries
          .filter(([client]) => !isFiltering || clients.includes(client))
          .map(([client, data]) => ({
            client,
            url: data.screenshots?.default || data.url,
          }))
          .filter((s) => s.url);

        $.export(
          "$summary",
          `Retrieved ${screenshots.length} screenshots on attempt ${attempt}`
        );

        return { testId, screenshots, fullResults: response };
      }

      if (attempt < maxAttempts) {
        console.log(
          `Attempt ${attempt}: Screenshots not ready. Retrying in ${pollDelayMs / 1000}s...`
        );
        await new Promise((resolve) => setTimeout(resolve, pollDelayMs));
      }
    }

    throw new Error(
      `EOA test ${testId} did not produce screenshots after ${maxAttempts} attempts`
    );
  },
});
