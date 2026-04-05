// Look up the active PENDING NEWSLETTER_RUNS row for this proof pipeline run.
//
// Matches on NEWSLETTER_KEY = campaign name from the trigger body.
// Returns null if:
//   - No newsletter_key in trigger body (non-newsletter proof)
//   - No matching row in NEWSLETTER_RUNS
// The caller (post_approval_message) should handle null by falling back
// to the plain proof message.

export default defineComponent({
  props: {
    snowflake: {
      type: "app",
      app: "snowflake",
    },
  },
  async run({ steps, $ }) {
    const body = steps.trigger.event.body;
    const newsletter_key = body?.name || body?.campaign_name || body?.canvas_name;

    if (!newsletter_key) {
      $.export("$summary", "No newsletter_key in trigger, skipping lookup");
      return null;
    }

    const sql = `
      SELECT
        RUN_ID,
        NEWSLETTER_KEY,
        NEXT_SEND_TIME,
        AI_SUBJECT,
        AI_INTRO,
        DECISION
      FROM MCC_RAW.MARKETING_DEV.NEWSLETTER_RUNS
      WHERE NEWSLETTER_KEY = ?
        AND DECISION = 'PENDING'
      ORDER BY PREP_STARTED_AT DESC
      LIMIT 1
    `;

    const result = await this.snowflake.executeQuery({
      sqlText: sql,
      binds: [newsletter_key],
    });

    const rows = result?.rows || [];
    if (rows.length === 0) {
      $.export(
        "$summary",
        `No PENDING run found for ${newsletter_key} — will post plain message`
      );
      return null;
    }

    const row = rows[0];
    const run = {
      run_id: row.RUN_ID,
      newsletter_key: row.NEWSLETTER_KEY,
      next_send_time: row.NEXT_SEND_TIME,
      ai_subject: row.AI_SUBJECT,
      ai_intro: row.AI_INTRO,
    };

    $.export("$summary", `Found PENDING run ${run.run_id}`);
    return run;
  },
});
