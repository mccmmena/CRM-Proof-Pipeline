// If the trigger included a callback_url, POST results back.
// This allows the calling workflow (orchestrator) to resume from $.flow.suspend.
// If no callback_url was provided (standalone invocation), skip gracefully.

import { axios } from "@pipedream/platform";

export default defineComponent({
  async run({ steps, $ }) {
    const callback_url = steps.trigger.event.body?.callback_url;
    if (!callback_url) {
      $.export("$summary", "No callback_url — skipping");
      return { posted: false };
    }

    const run = steps.write_run_history.$return_value;
    const ai = steps.generate_ai_content.$return_value;
    const config = steps.load_config.$return_value;

    const payload = {
      status: "complete",
      run_id: run.run_id,
      newsletter_key: config.newsletter_key,
      ai_subject: ai.ai_subject,
      ai_intro: ai.ai_intro,
    };

    await axios($, {
      method: "POST",
      url: callback_url,
      headers: { "Content-Type": "application/json" },
      data: payload,
    });

    $.export("$summary", `Posted callback to orchestrator`);
    return { posted: true, run_id: run.run_id };
  },
});
