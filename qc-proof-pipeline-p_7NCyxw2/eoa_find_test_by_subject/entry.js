import { axios } from "@pipedream/platform";

export default {
    name: "Email on Acid Find Test by Subject",
    version: "0.0.3",
    key: "eoa-find-test-by-subject",
    description: "Searches for an Email on Acid test by its subject line and returns the latest matching test ID.",
    type: "action",
    props: {
      email_on_acid: {
        type: "app",
        app: "email_on_acid",
    },
        subject: {
            type: "string",
            label: "Email Subject",
            description: "Characters contained within the subject line. This is a case-insensitive search.",
        },
    },
    async run({ $ }) {
        const auth = Buffer.from(`${this.email_on_acid.$auth.api_key}:${this.email_on_acid.$auth.account_password}`).toString("base64");

        const response = await axios($, {
            method: "GET",
            url: "https://api.emailonacid.com/v5/email/tests",
            params: {
                subject: this.subject,
            },
            headers: {
                Authorization: `Basic ${auth}`,
            },
        });

        // The API returns an array of test objects. 
        // Usually sorted by creation date descending, so the first one is the latest.
        const tests = response || [];
        const latestTest = tests[0];

        if (!latestTest) {
            throw new Error(`No Email on Acid tests found with subject containing: "${this.subject}"`);
        }

        $.export("$summary", `Successfully found test ID: ${latestTest.id} for subject: "${this.subject}"`);

        return {
            testId: latestTest.id,
            subject: latestTest.subject,
            date: latestTest.date,
            fullTestData: latestTest,
        };
    },
};
