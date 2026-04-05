export default defineComponent({
  props: {
    data: {
      type: "data_store",
    },
  },
  async run({ steps, $ }) {
    const { subject, callback_url } =
      steps.validate_and_respond.$return_value;

    await this.data.set(subject, {
      callback_url,
      timestamp: Date.now(),
    });

    $.export("$summary", `Stored callback for subject: ${subject}`);

    return { subject, stored: true };
  },
});
