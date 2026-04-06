// Extract the run_id from the UUID query and pass it downstream.
// The actual INSERT is done by the insert_run_history built-in step.
//
// Reads: generate_run_id result
// Returns: { run_id }

export default defineComponent({
  async run({ steps, $ }) {
    const uuidRows = steps.generate_run_id.$return_value || [];
    const run_id = uuidRows[0]?.RUN_ID;
    if (!run_id) {
      throw new Error("generate_run_id returned no UUID");
    }

    $.export("$summary", `Run ID: ${run_id}`);
    return { run_id };
  },
});
