// Extract screenshot data from the email-test-api callback (resume body).
// Returns the same shape that downstream steps (upload_to_drive,
// post_and_suspend) expect.

export default defineComponent({
  async run({ steps, $ }) {
    const resumeBody = $.context?.resume?.body;

    if (!resumeBody || resumeBody.status !== "complete") {
      console.log("Resume context:", JSON.stringify($.context?.resume, null, 2));
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
