// Upsert AI content into the shared crm_newsletters_content catalog.
// One row per newsletter, keyed by newsletter_key.

import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    braze: {
      type: "app",
      app: "braze",
    },
  },
  async run({ steps, $ }) {
    const { newsletter_key } = steps.load_config.$return_value;
    const { run_id } = steps.write_run_history.$return_value;
    const { ai_subject, ai_intro, ai_intro_html } = steps.parse_ghostwriter.$return_value;

    const item = {
      id: newsletter_key,
      ai_subject,
      ai_intro,
      ai_intro_html: ai_intro_html || "",
      run_id,
      generated_at: new Date().toISOString(),
    };

    const response = await axios($, {
      method: "PUT",
      url: `https://${this.braze.$auth.instance_domain}.braze.${this.braze.$auth.region}/catalogs/crm_newsletters_content/items`,
      headers: {
        Authorization: `Bearer ${this.braze.$auth.api_key}`,
        "Content-Type": "application/json",
      },
      data: { items: [item] },
    });

    $.export(
      "$summary",
      `Upserted AI content for ${newsletter_key} into crm_newsletters_content`
    );
    return { response };
  },
});
