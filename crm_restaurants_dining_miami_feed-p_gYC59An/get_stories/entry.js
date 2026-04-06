import { axios } from "@pipedream/platform"

export default defineComponent({
  name: "Retrieve Generic Feed",
  description: "Fetches a generic JSON feed and normalizes the items",
  key: "retrieve_generic_feed",
  version: "0.0.1",
  type: "action",
  props: {
    url: {
      type: "string",
      label: "Feed URL",
      description: "The URL of the JSON feed to retrieve",
    },
    limit: {
      type: "integer",
      label: "Limit",
      description: "Maximum number of items to return",
      optional: true,
    },
  },
  async run({ $ }) {
    const parseDate = (val) => {
      if (!val) return ''
      try {
        const date = new Date(typeof val === 'number' && val <= 1e10 ? val * 1000 : val)
        return date.toISOString()
      } catch {
        return val.toString()
      }
    }

    const extractTags = (item) => {
      const tags = [
        ...(Array.isArray(item.tags) ? item.tags : (item.tags ? [item.tags] : [])),
        ...(Array.isArray(item.categories) ? item.categories : []),
        ...(Array.isArray(item.topic_tags) ? item.topic_tags.map(t => t.name || t) : [])
      ]
      return [...new Set(tags)].join(', ')
    }

    const normalizeFeedItem = (item) => {
      const title = item.headline || item.title || ''
      const sectionName = (typeof item.section === 'string' ? item.section : item.section?.name) || item.section_name || item.home_section?.name || item.hub || ''
      const sectionUrl = item.section?.url || item.section_url || item.home_section?.url || ''

      // Handle authors array with name and email
      let author = ''
      if (Array.isArray(item.authors)) {
        author = item.authors.map(a => {
          if (typeof a === 'object' && a.name) {
            return a.email ? `${a.name} (${a.email})` : a.name
          }
          return a.name || a
        }).join(', ')
      } else {
        author = item.author || item.byline || ''
      }

      return {
        id: item.id || '',
        title: (item.content_type === 'gallery' || item.type === 'gallery' || item.asset_type === 'gallery')
          ? `[GALLERY] ${title}`
          : title,
        description: item.summary || item.meta_description || item.description || '',
        url: item.url || item.link || item.permalink || item.canonical_url || '',
        thumbnail: item.thumbnail || (typeof item.image === 'string' ? item.image : item.image?.url) || item.featured_image || '',
        thumbnail_alt: item.thumbnail_alt || item.alt || item.image?.alt || '',
        section_name: sectionName,
        section_url: sectionUrl,
        tags: extractTags(item),
        publication_date: parseDate(item.published_date || item.pubDate || item.date),
        author: author,
        content_type: item.content_type || item.type || 'article',
        asset_type: item.asset_type || '',
        meta_title: item.meta_title || '',
        meta_description: item.meta_description || '',
        keywords: Array.isArray(item.keywords) ? item.keywords.join(', ') : (item.keywords || ''),
        hub: item.hub || ''
      }
    }

    let feedData
    try {
      feedData = await axios($, {
        url: this.url,
        method: "GET",
        headers: { "User-Agent": "pipedream/1" },
        timeout: 30000
      })
    } catch (error) {
      throw new Error(`Failed to fetch feed: ${error.message}`)
    }

    const items = Array.isArray(feedData?.items) ? feedData.items :
      Array.isArray(feedData) ? feedData :
        (feedData && typeof feedData === 'object') ? [feedData] : []

    const normalizedItems = items.map(normalizeFeedItem)
    const limitedItems = this.limit ? normalizedItems.slice(0, this.limit) : normalizedItems
    $.export("$summary", `Successfully retrieved and normalized ${limitedItems.length} items`)
    return limitedItems
  }
})