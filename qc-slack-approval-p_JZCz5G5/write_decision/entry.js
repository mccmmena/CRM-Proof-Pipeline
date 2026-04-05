// Conditionally record the user's decision in Snowflake and the shared
// Pipedream data store.
//
// The Snowflake UPDATE is gated on DECISION='PENDING' so a late click after
// the content-prep workflow has already timed out is a safe no-op.
//
// Returns: { applied: boolean, decision }

export default defineComponent({
  props: {
    snowflake: {
      type: "app",
      app: "snowflake",
    },
    data: {
      type: "data_store",
    },
  },
  async run({ steps, $ }) {
    const { run_id, decision, user_id } = steps.parse_payload.$return_value;

    // Conditional UPDATE — only wins if DECISION is still PENDING
    const result = await this.snowflake.executeQuery({
      sqlText: `
        UPDATE CRM_OPS.NEWSLETTER.NEWSLETTER_RUNS
        SET DECISION = ?,
            DECIDED_BY = ?,
            DECIDED_AT = CURRENT_TIMESTAMP()
        WHERE RUN_ID = ?
          AND DECISION = 'PENDING'
      `,
      binds: [decision, user_id, run_id],
    });

    const updated = result?.rowCount || result?.numRowsUpdated || 0;

    if (updated === 0) {
      $.export(
        "$summary",
        `Run ${run_id} already decided, click ignored`
      );
      return { applied: false, decision };
    }

    // Update the shared data store so finalize_decision sees it on wake
    const existing = (await this.data.get(run_id)) || {};
    await this.data.set(run_id, {
      ...existing,
      decision,
      decided_by: user_id,
      decided_at: Date.now(),
    });

    $.export("$summary", `Run ${run_id} marked ${decision} by ${user_id}`);
    return { applied: true, decision };
  },
});
