// Convert fetch_feed stories to CSV format for @mcclatchy/braze-catalog-update.
// Maps our story fields to the standard catalog schema.

export default defineComponent({
  async run({ steps, $ }) {
    const { stories } = steps.fetch_feed.$return_value;

    if (!stories || stories.length === 0) {
      $.export("$summary", "No stories to convert");
      return [];
    }

    const headers = [
      "id",
      "title",
      "description",
      "url",
      "thumbnail",
      "thumbnail_alt",
      "section_name",
      "section_url",
      "tags",
      "publication_date",
      "rank",
    ];

    const csvArray = [headers];

    stories.forEach((story) => {
      csvArray.push([
        story.slot.toString(),
        story.title || "",
        story.deck || "",
        story.article_url || "",
        story.image_url || "",
        "",
        story.source_label || "",
        "",
        "",
        story.published_at || "",
        story.slot.toString(),
      ]);
    });

    $.export(
      "$summary",
      `Converted ${stories.length} stories to CSV format`
    );
    return csvArray;
  },
});
