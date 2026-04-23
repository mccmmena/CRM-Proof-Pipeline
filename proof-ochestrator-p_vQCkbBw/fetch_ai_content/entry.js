// Fetch the latest AI-generated subject and intro from the Braze
// crm_newsletters_content catalog.  Falls back to the values returned
// by the content-prep callback if the catalog read fails.

import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    braze: {
      type: "app",
      app: "braze",
    },
    newsletterKey: {
      type: "string",
      label: "Newsletter Key",
    },
    contentPrepResume: {
      type: "any",
      label: "Content Prep Resume Data",
      optional: true,
    },
  },
  async run({ $ }) {
    const fallback = this.contentPrepResume || {};
    let aiSubject = fallback.ai_subject || "";
    let aiIntro = fallback.ai_intro || "";
    let aiIntroHtml = fallback.ai_intro_html || "";

    try {
      const resp = await axios($, {
        method: "GET",
        url: `https://${this.braze.$auth.instance_domain}.braze.${this.braze.$auth.region}/catalogs/crm_newsletters_content/items/${this.newsletterKey}`,
        headers: {
          Authorization: `Bearer ${this.braze.$auth.api_key}`,
        },
      });
      aiSubject = resp?.item?.ai_subject || aiSubject;
      aiIntro = resp?.item?.ai_intro || aiIntro;
      aiIntroHtml = resp?.item?.ai_intro_html || aiIntroHtml;
    } catch (e) {
      console.warn("Could not fetch from crm_newsletters_content, using callback values:", e.message);
    }

    $.export("$summary", `AI content: subject=${aiSubject ? "yes" : "no"}, intro=${aiIntro ? "yes" : "no"}`);
    return { ai_subject: aiSubject, ai_intro: aiIntro, ai_intro_html: aiIntroHtml };
  },
});
