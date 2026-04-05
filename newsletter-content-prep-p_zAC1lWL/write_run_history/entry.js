// Insert a new NEWSLETTER_RUNS row for this run.
// Uses UUID as RUN_ID. DECISION starts as PENDING.
//
// Returns: { run_id }

import crypto from "crypto";

function uuid() {
  // Simple UUID v4
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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

    const run_id = uuid();

    const sql = `
      INSERT INTO MCC_RAW.MARKETING_DEV.NEWSLETTER_RUNS
        (RUN_ID, NEWSLETTER_KEY, NEXT_SEND_TIME, PREP_STARTED_AT, STORIES, DECISION)
      SELECT ?, ?, ?, CURRENT_TIMESTAMP(), PARSE_JSON(?), 'PENDING'
    `;

    await this.snowflake.executeQuery({
      sqlText: sql,
      binds: [run_id, newsletter_key, next_send_time, JSON.stringify(stories)],
    });

    $.export("$summary", `Created run ${run_id}`);
    return { run_id };
  },
});
