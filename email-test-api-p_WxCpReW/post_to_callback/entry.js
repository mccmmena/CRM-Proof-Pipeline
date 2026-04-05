import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Post Results to Callback",
  version: "0.0.1",
  key: "post-to-callback",
  description:
    "POSTs the Email on Acid results (screenshots, analysis) to the caller's callback URL.",
  type: "action",
  props: {
    callback_url: {
      type: "string",
      label: "Callback URL",
      description: "The URL to POST results to",
    },
    subject: {
      type: "string",
      label: "Subject",
    },
    testId: {
      type: "string",
      label: "EOA Test ID",
    },
    screenshots: {
      type: "any",
      label: "Screenshots",
      description: "Array of screenshot objects from EOA",
    },
    fullResults: {
      type: "any",
      label: "Full Results",
      description: "Complete EOA results object",
    },
  },
  async run({ $ }) {
    const payload = {
      status: "complete",
      subject: this.subject,
      testId: this.testId,
      screenshots: this.screenshots,
      full_results: this.fullResults,
    };

    try {
      const response = await axios($, {
        method: "POST",
        url: this.callback_url,
        headers: { "Content-Type": "application/json" },
        data: payload,
      });

      $.export(
        "$summary",
        `Posted ${this.screenshots?.length || 0} screenshots to callback URL`
      );

      return { callback_status: "delivered", response };
    } catch (error) {
      console.error(`Callback POST failed: ${error.message}`);
      $.export("$summary", `Callback failed: ${error.message}`);

      return {
        callback_status: "failed",
        error: error.message,
        payload,
      };
    }
  },
});
