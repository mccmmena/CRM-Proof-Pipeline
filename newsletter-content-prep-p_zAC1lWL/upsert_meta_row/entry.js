// Upsert the catalog "meta" row with AI subject + intro and run metadata.

import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    braze: {
      type: "app",
      app: "braze",
    },
  },
  async run({ steps, $ }) {
    const { braze_catalog_id } = steps.load_config.$return_value;
    const { run_id } = steps.write_run_history.$return_value;
    const { ai_subject, ai_intro } = steps.generate_ai_content.$return_value;

    const metaItem = {
      id: "meta",
      ai_subject,
      ai_intro,
      run_id,
      generated_at: new Date().toISOString(),
    };

    const response = await axios($, {
      method: "PUT",
      url: `https://${this.braze.$auth.instance_domain}.braze.${this.braze.$auth.region}/catalogs/${braze_catalog_id}/items`,
      headers: {
        Authorization: `Bearer ${this.braze.$auth.api_key}`,
        "Content-Type": "application/json",
      },
      data: { items: [metaItem] },
    });

    $.export(
      "$summary",
      `Upserted meta row with AI content for run ${run_id}`
    );
    return { response };
  },
});
