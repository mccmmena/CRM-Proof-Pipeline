// Log AI verdict status before continuing to Slack approval.

export default defineComponent({
  async run({ steps, $ }) {
    const verdict = steps.verify_proof?.$return_value;
    const issueNote = verdict?.needs_review
      ? `AI flagged ${verdict.issues?.length || 0} issue(s)`
      : "Proof passed automated QC";
    $.export("$summary", `Newsletter proof — ${issueNote} — continuing to Slack`);
  },
});
