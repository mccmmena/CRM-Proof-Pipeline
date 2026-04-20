// Log AI verdict status before continuing to Slack approval.

export default defineComponent({
  props: {
    verifyResult: {
      type: "any",
      label: "Verify Proof Result",
    },
  },
  async run({ $ }) {
    const verdict = this.verifyResult;
    const issueNote = verdict?.needs_review
      ? `AI flagged ${verdict.issues?.length || 0} issue(s)`
      : "Proof passed automated QC";
    $.export("$summary", `Newsletter proof — ${issueNote} — continuing to Slack`);
  },
});
