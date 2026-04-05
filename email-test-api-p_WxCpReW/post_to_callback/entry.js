import { axios } from "@pipedream/platform";

export default defineComponent({
  async run({ steps, $ }) {
    const callback_url = steps.validate_and_respond.$return_value.callback_url;
    const subject = steps.validate_and_respond.$return_value.subject;
    const testId = steps.eoa_find_test.$return_value.testId;
    const screenshots = steps.eoa_get_results.$return_value.screenshots;
    const fullResults = steps.eoa_get_results.$return_value.fullResults;

    const payload = {
      status: "complete",
      subject,
      testId,
      screenshots,
      full_results: fullResults,
    };

    try {
      const response = await axios($, {
        method: "POST",
        url: callback_url,
        headers: { "Content-Type": "application/json" },
        data: payload,
      });

      $.export(
        "$summary",
        `Posted ${screenshots?.length || 0} screenshots to callback URL`
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
