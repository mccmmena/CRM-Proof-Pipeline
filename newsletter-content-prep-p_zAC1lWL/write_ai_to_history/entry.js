// Confirm the AI history update completed.
// The actual UPDATE is done by the update_ai_history built-in step.

export default defineComponent({
  async run({ steps, $ }) {
    const run_id = steps.write_run_history.$return_value?.run_id;
    $.export("$summary", `AI content written to run ${run_id}`);
    return { run_id };
  },
});
