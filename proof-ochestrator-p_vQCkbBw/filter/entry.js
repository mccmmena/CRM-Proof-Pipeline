// Gate based on newsletter status and verify_proof AI verdict.
// Newsletters: always continue to Slack (AI content needs approval).
// Non-newsletters: always exit (no Slack approval flow).

export default defineComponent({
  async run({ steps, $ }) {
    const config = steps.check_config?.$return_value;
    const verdict = steps.verify_proof?.$return_value;

    if (config) {
      const issueNote = verdict?.needs_review
        ? `AI flagged ${verdict.issues?.length || 0} issue(s)`
        : "Proof passed automated QC";
      $.export("$summary", `Newsletter — ${issueNote} — continuing to Slack`);
      return;
    }

    $.export("$summary", `Non-newsletter proof — ${verdict?.summary || "done"}`);
    return $.flow.exit("Non-newsletter proof — no Slack approval needed");
  },
});
