import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    email_on_acid: {
      type: "app",
      app: "email_on_acid",
    },
  },
  async run({ steps, $ }) {
    const subject = steps.validate_and_respond.$return_value.subject;

    const auth = Buffer.from(
      `${this.email_on_acid.$auth.api_key}:${this.email_on_acid.$auth.account_password}`
    ).toString("base64");

    const maxRetries = 3;
    const retryDelayMs = 30000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const response = await axios($, {
        method: "GET",
        url: "https://api.emailonacid.com/v5/email/tests",
        params: { subject },
        headers: { Authorization: `Basic ${auth}` },
      });

      const tests = response || [];
      const latestTest = tests[0];

      if (latestTest) {
        $.export(
          "$summary",
          `Found test ID: ${latestTest.id} for subject "${subject}" on attempt ${attempt}`
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
          `Attempt ${attempt}: No test found for "${subject}". Retrying in ${retryDelayMs / 1000}s...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    throw new Error(
      `No Email on Acid test found with subject containing "${subject}" after ${maxRetries} attempts`
    );
  },
});
