// Compute minutes from now until the approval cutoff (10 minutes before send).
// Returned value feeds the delay-workflow-delay step.

const CUTOFF_MINUTES_BEFORE_SEND = 10;
const MIN_DELAY_MINUTES = 1;

export default defineComponent({
  async run({ steps, $ }) {
    const { next_send_time } = steps.load_config.$return_value;

    const sendTs = new Date(next_send_time).getTime();
    if (isNaN(sendTs)) {
      throw new Error(`Invalid next_send_time: ${next_send_time}`);
    }

    const cutoffTs = sendTs - CUTOFF_MINUTES_BEFORE_SEND * 60 * 1000;
    const nowTs = Date.now();
    const minutesUntilCutoff = Math.round((cutoffTs - nowTs) / 60000);

    // If cutoff already passed (or within 1 min), delay by 1 min so the
    // workflow still completes cleanly and finalize_decision runs.
    const delayMinutes = Math.max(minutesUntilCutoff, MIN_DELAY_MINUTES);

    $.export(
      "$summary",
      `Delaying ${delayMinutes} min until cutoff (send at ${next_send_time})`
    );

    return delayMinutes;
  },
});
