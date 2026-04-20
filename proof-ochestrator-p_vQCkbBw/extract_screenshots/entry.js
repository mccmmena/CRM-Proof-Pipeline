// Extract screenshot data from the email-test-api resume data.
// Filters to a curated set of clients and adds friendly names for Drive upload.
// Extracts the real email subject from the rendered HTML <title> tag.

const PREFERRED_CLIENTS = [
  { id: "iphone16_18", name: "iPhone 16 - iOS 18" },
  { id: "iphone16_18_dm", name: "iPhone 16 - iOS 18 Dark" },
  { id: "iphone16pro_18", name: "iPhone 16 Pro - iOS 18" },
  { id: "android15_gmailapp_pixel9_lm", name: "Gmail App - Pixel 9" },
  { id: "android15_gmailapp_pixel9_dm", name: "Gmail App - Pixel 9 Dark" },
  { id: "gmailcom-lm_chrcurrent_win10", name: "Gmail.com - Chrome" },
  { id: "gmailcom-dm_chrcurrent_win10", name: "Gmail.com - Chrome Dark" },
  { id: "outlookcom-lm_chrcurrent_win10", name: "Outlook.com - Chrome" },
  { id: "outlookcom-dm_chrcurrent_win10", name: "Outlook.com - Chrome Dark" },
  { id: "applemail16", name: "Apple Mail 16" },
  { id: "applemail16_dm", name: "Apple Mail 16 Dark" },
  { id: "m365_w11_lm_dt", name: "Outlook 365 - Win 11" },
  { id: "m365_w11_dm_dt", name: "Outlook 365 - Win 11 Dark" },
];

function extractTitle(html) {
  if (!html) return null;
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim() : null;
}

export default defineComponent({
  props: {
    resumeData: {
      type: "any",
      label: "Email Test API Resume Data",
    },
    renderedHtml: {
      type: "string",
      label: "Rendered HTML",
      optional: true,
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

    const allScreenshots = resumeBody.screenshots || [];
    const preferredIds = new Set(PREFERRED_CLIENTS.map((c) => c.id));
    const nameMap = new Map(PREFERRED_CLIENTS.map((c) => [c.id, c.name]));

    // Filter to preferred clients, add friendly name
    const screenshots = allScreenshots
      .filter((s) => preferredIds.has(s.client))
      .map((s) => ({
        ...s,
        name: nameMap.get(s.client) || s.client,
      }));

    // Extract real subject from <title> tag
    const realSubject = extractTitle(this.renderedHtml) || resumeBody.subject || null;

    $.export(
      "$summary",
      `Extracted ${screenshots.length} of ${allScreenshots.length} screenshots (filtered to key clients)`
    );

    return {
      screenshots,
      testId: resumeBody.testId || null,
      full_results: resumeBody.full_results || null,
      realSubject,
    };
  },
});
