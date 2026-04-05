import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Email on Acid Find Test by Subject (with Retry)",
  version: "0.0.1",
  key: "eoa-find-test-retry",
  description:
    "Searches for an Email on Acid test by subject line. Retries up to 3 times with 30s intervals if the test hasn't appeared yet.",
  type: "action",
  props: {
    email_on_acid: {
      type: "app",
      app: "email_on_acid",
    },
    subject: {
      type: "string",
      label: "Email Subject",
      description:
        "Characters contained within the subject line. Case-insensitive search.",
    },
  },
  async run({ $ }) {
    const auth = Buffer.from(
      `${this.email_on_acid.$auth.api_key}:${this.email_on_acid.$auth.account_password}`
    ).toString("base64");

    const maxRetries = 3;
    const retryDelayMs = 30000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const response = await axios($, {
        method: "GET",
        url: "https://api.emailonacid.com/v5/email/tests",
        params: { subject: this.subject },
        headers: { Authorization: `Basic ${auth}` },
      });

      const tests = response || [];
      const latestTest = tests[0];

      if (latestTest) {
        $.export(
          "$summary",
          `Found test ID: ${latestTest.id} for subject "${this.subject}" on attempt ${attempt}`
        );
        return {
          testId: latestTest.id,
          subject: latestTest.subject,
          date: latestTest.date,
          fullTestData: latestTest,
        };
      }

      if (attempt < maxRetries) {
        console.log(
          `Attempt ${attempt}: No test found for "${this.subject}". Retrying in ${retryDelayMs / 1000}s...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    throw new Error(
      `No Email on Acid test found with subject containing "${this.subject}" after ${maxRetries} attempts`
    );
  },
});
