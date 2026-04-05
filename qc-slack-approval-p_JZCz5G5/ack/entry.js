// Respond 200 within 3 seconds so Slack doesn't timeout.
// Must run very early in the workflow.

export default defineComponent({
  async run({ steps, $ }) {
    await $.respond({
      immediate: true,
      status: 200,
      headers: { "Content-Type": "text/plain" },
      body: "",
    });
    return { acked: true };
  },
});
