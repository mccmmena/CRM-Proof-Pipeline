import { axios } from "@pipedream/platform";

const DEFAULT_CLIENTS = [
  "iphone16_18",
  "iphone16_18_dm",
  "android15_gmailapp_pixel9_lm",
  "android15_gmailapp_pixel9_dm",
  "gmailcom-lm_chrcurrent_win10",
  "gmailcom-dm_chrcurrent_win10",
  "applemail16",
  "applemail16_dm",
  "m365_w11_lm_dt",
  "m365_w11_dm_dt",
];

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
    payload.clients = clients && clients.length > 0 ? clients : DEFAULT_CLIENTS;

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
