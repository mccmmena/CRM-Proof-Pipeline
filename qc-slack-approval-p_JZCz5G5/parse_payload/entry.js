// Parse the Slack interactivity payload. Slack sends form-urlencoded with a
// single "payload" field containing JSON.
//
// Returns: {
//   run_id, decision, newsletter_key,
//   user_id, user_name,
//   response_url, channel_id, message_ts,
//   action_id
// }

export default defineComponent({
  async run({ steps, $ }) {
    const body = steps.trigger.event.body;
    const rawPayload =
      typeof body === "object" ? body.payload : null;
    if (!rawPayload) {
      throw new Error("No payload field in Slack request body");
    }

    let payload;
    try {
      payload = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
    } catch (e) {
      throw new Error(`Failed to parse Slack payload JSON: ${e.message}`);
    }

    const action = payload.actions?.[0];
    if (!action) {
      throw new Error("Payload has no actions");
    }

    const [run_id, decision, newsletter_key] = (action.value || "").split("|");

    if (!run_id || !decision) {
      throw new Error(`Invalid action value: ${action.value}`);
    }

    const result = {
      run_id,
      decision,
      newsletter_key,
      action_id: action.action_id,
      user_id: payload.user?.id,
      user_name: payload.user?.username || payload.user?.name,
      response_url: payload.response_url,
      channel_id: payload.channel?.id,
      message_ts: payload.message?.ts,
    };

    $.export(
      "$summary",
      `Parsed ${result.decision} from ${result.user_id} for run ${run_id}`
    );
    return result;
  },
});
