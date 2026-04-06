// Fetch stories from one or more JSON feeds and normalize them into a
// single ordered list of slots.
//
// Reads: feed_sources (array) and max_stories from load_config
// Returns: { stories: [{ slot, title, deck, image_url, article_url, byline,
//                         published_at, source_label }, ...] }
//
// feed_sources shape: [
//   { "url": "https://...", "count": 3, "label": "Local" },
//   { "url": "https://...", "count": 4, "label": "Sports" },
//   ...
// ]
//
// Stories are fetched from each source in order, sliced to `count`, and
// concatenated. Slot numbers are assigned sequentially across the combined
// list. If any feed errors out (network, bad JSON, unrecognized shape),
// the whole step fails — safer than sending a broken email.

import { axios } from "@pipedream/platform";

// Normalize one feed response to a flat list of story objects.
// Handles common top-level shapes: array, { items }, { stories }, { data }.
function normalizeFeed(response, feedUrl) {
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
      `Unrecognized feed shape at ${feedUrl}. Top-level keys: ${Object.keys(
        response || {}
      ).join(", ")}`
    );
  }

  return rawItems.map((item) => ({
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
}

export default defineComponent({
  async run({ steps, $ }) {
    const { feed_sources, max_stories } = steps.load_config.$return_value;

    if (!Array.isArray(feed_sources) || feed_sources.length === 0) {
      throw new Error("feed_sources is missing or empty");
    }

    const combined = [];

    for (const source of feed_sources) {
      const { url, count, label } = source;
      if (!url || typeof count !== "number" || count < 1) {
        throw new Error(
          `Invalid feed_source entry: ${JSON.stringify(source)} — each entry requires { url, count }`
        );
      }

      const response = await axios($, {
        method: "GET",
        url,
        headers: { Accept: "application/json" },
      });

      const items = normalizeFeed(response, url);
      if (items.length < count) {
        console.warn(
          `Feed ${url} returned ${items.length} items but config requested ${count}. Taking what's available.`
        );
      }

      const taken = items.slice(0, count);
      for (const story of taken) {
        combined.push({ ...story, source_label: label || null });
      }
    }

    // Assign sequential slot numbers across the combined list
    const stories = combined.map((story, i) => ({
      slot: i + 1,
      ...story,
    }));

    if (max_stories && stories.length !== max_stories) {
      console.warn(
        `Total stories (${stories.length}) does not match MAX_STORIES (${max_stories}). Check FEED_SOURCES counts.`
      );
    }

    $.export(
      "$summary",
      `Fetched ${stories.length} stories from ${feed_sources.length} feed(s)`
    );
    return { stories };
  },
});
