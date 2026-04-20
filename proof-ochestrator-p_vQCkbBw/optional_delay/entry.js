// Conditionally delay the workflow. If delayMinutes > 0, delay for that
// many minutes. Otherwise skip.

export default defineComponent({
  props: {
    delayMinutes: {
      type: "integer",
      label: "Delay Minutes",
      default: 0,
    },
  },
  async run({ $ }) {
    const minutes = Number(this.delayMinutes) || 0;

    if (minutes <= 0) {
      $.export("$summary", "No delay — proceeding immediately");
      return { delayed: false, minutes: 0 };
    }

    $.flow.delay(minutes * 60 * 1000);

    $.export("$summary", `Delaying ${minutes} minutes`);
    return { delayed: true, minutes };
  },
});
