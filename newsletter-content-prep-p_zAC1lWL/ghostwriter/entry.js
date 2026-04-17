import { axios } from "@pipedream/platform"

export default defineComponent({
  props: {
    elvex_api_key: {
      type: "string",
      label: "Elvex API Key",
      secret: true,
    },
    assistant_id: {
      type: "string",
      label: "Assistant ID",
      description: "The unique ID of your Elvex assistant.",
    },
    version: {
      type: "integer",
      label: "Assistant Version",
      default: 1,
    },
    prompt: {
      type: "string",
      label: "Prompt",
      description: "The text prompt you want the assistant to respond to.",
    },
  },
  async run({ steps, $ }) {
    const url = `https://api.elvex.ai/v0/apps/${this.assistant_id}/versions/${this.version}/text/generate`
    
    try {
      const response = await axios($, {
        method: "POST",
        url: url,
        headers: {
          "Authorization": `Bearer ${this.elvex_api_key}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        data: {
          prompt: this.prompt,
        },
      })

      // The Elvex API typically returns the text in response.data.response
      // Pipedream's axios wrapper returns the body directly as 'response'
      return response
    } catch (error) {
      // Provide detailed error info if the request fails
      $.export("error_details", error.response?.data || error.message)
      throw error
    }
  },
})