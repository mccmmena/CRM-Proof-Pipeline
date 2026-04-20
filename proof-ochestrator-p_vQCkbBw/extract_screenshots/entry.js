// Extract screenshot data from the email-test-api resume data.

export default defineComponent({
  props: {
    resumeData: {
      type: "any",
      label: "Email Test API Resume Data",
    },
  },
  async run({ $ }) {
    const resumeBody = this.resumeData;

    if (!resumeBody || resumeBody.status !== "complete") {
      console.log("Resume data:", JSON.stringify(resumeBody, null, 2));
      throw new Error(
        `Unexpected resume status: ${resumeBody?.status || "missing"} — email-test-api may have timed out`
      );
    }

    const screenshots = resumeBody.screenshots || [];
    const testId = resumeBody.testId || null;
    const full_results = resumeBody.full_results || null;

    $.export(
      "$summary",
      `Extracted ${screenshots.length} screenshots from email-test-api callback`
    );

    return { screenshots, testId, full_results };
  },
});
