// Check that the user clicking the button is in the newsletter's APPROVERS list.
//
// Reads approvers from NEWSLETTER_CONFIG for the given newsletter_key.
// If user not authorized, exits the workflow (no state change, no Braze PATCH).

export default defineComponent({
  props: {
    snowflake: {
      type: "app",
      app: "snowflake",
    },
  },
  async run({ steps, $ }) {
    const { newsletter_key, user_id, user_name } =
      steps.parse_payload.$return_value;

    const result = await this.snowflake.executeQuery({
      sqlText: `
        SELECT APPROVERS
        FROM CRM_OPS.NEWSLETTER.NEWSLETTER_CONFIG
        WHERE NEWSLETTER_KEY = ?
      `,
      binds: [newsletter_key],
    });

    const row = result?.rows?.[0];
    if (!row) {
      $.export("$summary", `No config for ${newsletter_key}, rejecting`);
      return $.flow.exit("Unknown newsletter");
    }

    const approvers = row.APPROVERS || [];
    // APPROVERS may come back as an array or a string (Snowflake ARRAY)
    const approversArray = Array.isArray(approvers)
      ? approvers
      : typeof approvers === "string"
        ? JSON.parse(approvers)
        : [];

    if (approversArray.length > 0 && !approversArray.includes(user_id)) {
      $.export(
        "$summary",
        `User ${user_name} (${user_id}) not authorized for ${newsletter_key}`
      );
      return $.flow.exit("Not authorized");
    }

    $.export("$summary", `User ${user_name} authorized`);
    return { authorized: true };
  },
});
