
export default defineComponent({
  name: "Convert Feed Items to CSV",
  description: "Converts an array of normalized feed items into a CSV-formatted array",
  key: "feed_items_to_csv",
  version: "0.0.3",
  type: "action",
  props: {
    items: {
      type: "any",
      label: "Feed Items",
      description: "Array of normalized feed items to convert",
    },
  },
  async run({ $ }) {
    const items = Array.isArray(this.items) ? this.items : []

    if (items.length === 0) {
      $.export("$summary", "No items to process")
      return []
    }

    // Define headers based on the requested changes
    const headers = [
      'id',
      'title',
      'description',
      'url',
      'thumbnail',
      'thumbnail_alt',
      'section_name',
      'section_url',
      'tags',
      'publication_date',
      'rank'
    ]

    const csvArray = [headers]

    items.forEach((item, index) => {
      // Ensure we handle missing keys gracefully
      csvArray.push([
        item.id || '',
        item.title || '',
        item.description || '',
        item.url || '',
        item.thumbnail || '',
        item.thumbnail_alt || '',
        item.section_name || '',
        item.section_url || '',
        item.tags || '',
        item.publication_date || '',
        (index + 1).toString(), // Use 1-based index for ID as string
      ])
    })

    $.export("$summary", `Successfully converted ${items.length} items to CSV format`)

    return csvArray
  }
})
