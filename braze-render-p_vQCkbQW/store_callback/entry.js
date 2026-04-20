export default defineComponent({
  props: {
    data: {
      type: "data_store",
    },
  },
  async run({ steps, $ }) {
    const { renderKey, callback_url } =
      steps.validate_and_respond.$return_value;

    await this.data.set(renderKey, {
      callback_url,
      timestamp: Date.now(),
    });

    $.export("$summary", `Stored callback for key: ${renderKey}`);

    return { renderKey, stored: true };
  },
});
