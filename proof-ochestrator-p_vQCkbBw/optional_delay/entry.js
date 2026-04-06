// Conditionally delay the workflow. If the trigger body includes
// delay_minutes (> 0), delay for that many minutes. Otherwise skip.
//
// The scheduler can compute the delay before sending, or pass 0
// for immediate execution (e.g. manual/test triggers).

export default defineComponent({
  async run({ steps, $ }) {
    const delayMinutes = Number(steps.trigger.event.body?.delay_minutes) || 0;

    if (delayMinutes <= 0) {
      $.export("$summary", "No delay — proceeding immediately");
      return { delayed: false, minutes: 0 };
    }

    const delayMs = delayMinutes * 60 * 1000;
    $.flow.delay(delayMs);

    $.export("$summary", `Delaying ${delayMinutes} minutes`);
    return { delayed: true, minutes: delayMinutes };
  },
});
