import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    email_on_acid: {
      type: "app",
      app: "email_on_acid",
    },
  },
  async run({ steps, $ }) {
    const { subject, html_body, clients } =
      steps.validate_and_respond.$return_value;

    const auth = Buffer.from(
      `${this.email_on_acid.$auth.api_key}:${this.email_on_acid.$auth.account_password}`
    ).toString("base64");

    const payload = { subject, html: html_body };
    if (clients && clients.length > 0) {
      payload.clients = clients;
    }

    const response = await axios($, {
      method: "POST",
      url: "https://api.emailonacid.com/v5/email/tests",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      data: payload,
    });

    $.export("$summary", `Created EOA test: ${response.id}`);

    return { testId: response.id };
  },
});
