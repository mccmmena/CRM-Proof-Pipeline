// Insert a new NEWSLETTER_RUNS row for this run.
// Uses Snowflake UUID_STRING() to generate the RUN_ID (no JS crypto needed).
// DECISION starts as PENDING.
//
// Returns: { run_id }

export default defineComponent({
  props: {
    snowflake: {
      type: "app",
      app: "snowflake",
    },
  },
  async run({ steps, $ }) {
    const { newsletter_key, next_send_time } = steps.load_config.$return_value;
    const { stories } = steps.fetch_feed.$return_value;

    // Snowflake generates the UUID and returns it via the INSERT. We use a
    // two-step pattern: SELECT UUID_STRING() first, then INSERT with that
    // value bound. This keeps the run_id available for downstream steps
    // without relying on INSERT ... RETURNING (which Snowflake doesn't
    // support).
    const uuidResult = await this.snowflake.executeQuery({
      sqlText: "SELECT UUID_STRING() AS RUN_ID",
    });
    const run_id = uuidResult?.rows?.[0]?.RUN_ID;
    if (!run_id) {
      throw new Error("Snowflake UUID_STRING() returned no value");
    }

    await this.snowflake.executeQuery({
      sqlText: `
        INSERT INTO MCC_RAW.MARKETING_DEV.NEWSLETTER_RUNS
          (RUN_ID, NEWSLETTER_KEY, NEXT_SEND_TIME, PREP_STARTED_AT, STORIES, DECISION)
        SELECT ?, ?, ?, CURRENT_TIMESTAMP(), PARSE_JSON(?), 'PENDING'
      `,
      binds: [run_id, newsletter_key, next_send_time, JSON.stringify(stories)],
    });

    $.export("$summary", `Created run ${run_id}`);
    return { run_id };
  },
});
