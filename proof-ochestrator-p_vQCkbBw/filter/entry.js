// Gate based on verify_proof AI verdict.
// If the proof passed automated QC, exit the workflow silently.
// If the AI flagged issues needing human review, continue to Slack.

export default defineComponent({
  async run({ steps, $ }) {
    const verdict = steps.verify_proof?.$return_value;
    if (!verdict?.needs_review) {
      $.export("$summary", `Proof passed automated QC — ${verdict?.summary || "no issues"}`);
      return $.flow.exit("Proof passed automated QC — no Slack notification needed");
    }
    $.export("$summary", `AI flagged ${verdict.issues?.length || 0} issue(s) — continuing to Slack`);
  },
});
