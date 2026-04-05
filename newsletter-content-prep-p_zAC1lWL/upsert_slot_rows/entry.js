// Upsert slot_1..slot_N rows into the Braze catalog via batch PUT.
// Replaces existing items. One row per story.

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
    const { stories } = steps.fetch_feed.$return_value;

    const items = stories.map((s) => ({
      id: `slot_${s.slot}`,
      title: s.title,
      deck: s.deck,
      image_url: s.image_url,
      article_url: s.article_url,
      byline: s.byline,
      published_at: s.published_at,
      active: true,
    }));

    const response = await axios($, {
      method: "PUT",
      url: `https://${this.braze.$auth.instance_domain}.braze.${this.braze.$auth.region}/catalogs/${braze_catalog_id}/items`,
      headers: {
        Authorization: `Bearer ${this.braze.$auth.api_key}`,
        "Content-Type": "application/json",
      },
      data: { items },
    });

    $.export(
      "$summary",
      `Upserted ${items.length} slot rows into catalog ${braze_catalog_id}`
    );
    return { items_count: items.length, response };
  },
});
