// Seed the shared data store with decision=PENDING for this run.
// Used by finalize_decision on wake, and by qc-slack-approval when a button
// is clicked.

export default defineComponent({
  props: {
    data: {
      type: "data_store",
    },
  },
  async run({ steps, $ }) {
    const { run_id } = steps.write_run_history.$return_value;
    const { newsletter_key, braze_catalog_id } =
      steps.load_config.$return_value;

    await this.data.set(run_id, {
      decision: "PENDING",
      newsletter_key,
      braze_catalog_id,
      seeded_at: Date.now(),
    });

    $.export("$summary", `Seeded decision state for ${run_id}`);
    return { run_id };
  },
});
