// Update the NEWSLETTER_RUNS row with the AI content that was generated.

export default defineComponent({
  props: {
    snowflake: {
      type: "app",
      app: "snowflake",
    },
  },
  async run({ steps, $ }) {
    const { run_id } = steps.write_run_history.$return_value;
    const { ai_subject, ai_intro, ai_model, raw } =
      steps.generate_ai_content.$return_value;

    const sql = `
      UPDATE MCC_RAW.MARKETING_DEV.NEWSLETTER_RUNS
      SET AI_SUBJECT = ?,
          AI_INTRO = ?,
          AI_MODEL = ?,
          AI_RAW_RESPONSE = PARSE_JSON(?)
      WHERE RUN_ID = ?
    `;

    await this.snowflake.executeQuery({
      sqlText: sql,
      binds: [ai_subject, ai_intro, ai_model, JSON.stringify(raw), run_id],
    });

    $.export("$summary", `Wrote AI content to run ${run_id}`);
    return { run_id };
  },
});
