// Conditionally delay the workflow until 1 hour before the scheduled send time.
// If next_send_time is in the past or less than 1 hour away, proceed immediately.

export default defineComponent({
  props: {
    nextSendTime: {
      type: "string",
      label: "Next Send Time",
      description: "ISO-8601 timestamp of the scheduled send",
      optional: true,
    },
  },
  async run({ $ }) {
    if (!this.nextSendTime) {
      $.export("$summary", "No send time — proceeding immediately");
      return { delayed: false, minutes: 0 };
    }

    const sendMs = new Date(this.nextSendTime).getTime();
    const oneHourBeforeMs = sendMs - 60 * 60 * 1000;
    const minutes = Math.max(0, Math.round((oneHourBeforeMs - Date.now()) / 60000));

    if (minutes <= 0) {
      $.export("$summary", "Send time is within 1 hour — proceeding immediately");
      return { delayed: false, minutes: 0 };
    }

    $.flow.delay(minutes * 60 * 1000);

    $.export("$summary", `Delaying ${minutes} minutes (until 1h before send)`);
    return { delayed: true, minutes };
  },
});
