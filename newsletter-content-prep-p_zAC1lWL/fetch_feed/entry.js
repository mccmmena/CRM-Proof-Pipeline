// Fetch the JSON feed and normalize to a list of stories
//
// Reads: json_feed_url from load_config
// Returns: { stories: [{ slot, title, deck, image_url, article_url, byline,
//                         published_at }, ...] }

import { axios } from "@pipedream/platform";

export default defineComponent({
  async run({ steps, $ }) {
    const { json_feed_url, max_stories } = steps.load_config.$return_value;

    const response = await axios($, {
      method: "GET",
      url: json_feed_url,
      headers: { Accept: "application/json" },
    });

    // Normalize. This is intentionally defensive — actual feed structure
    // needs to be confirmed and this mapping adjusted.
    // Common shapes handled: { items: [...] }, { stories: [...] },
    // { data: [...] }, or a top-level array.
    let rawItems = [];
    if (Array.isArray(response)) {
      rawItems = response;
    } else if (Array.isArray(response?.items)) {
      rawItems = response.items;
    } else if (Array.isArray(response?.stories)) {
      rawItems = response.stories;
    } else if (Array.isArray(response?.data)) {
      rawItems = response.data;
    } else {
      throw new Error(
        `Unrecognized feed shape. Top-level keys: ${Object.keys(response || {}).join(", ")}`
      );
    }

    const limited = rawItems.slice(0, max_stories);

    const stories = limited.map((item, i) => ({
      slot: i + 1,
      title: item.title || item.headline || "",
      deck: item.deck || item.description || item.summary || "",
      image_url:
        item.image_url ||
        item.image ||
        item.thumbnail ||
        item?.images?.[0]?.url ||
        "",
      article_url: item.url || item.link || item.article_url || "",
      byline: item.byline || item.author || "",
      published_at: item.published_at || item.date || item.pubDate || "",
    }));

    $.export("$summary", `Fetched ${stories.length} stories`);
    return { stories };
  },
});
