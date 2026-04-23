// Assemble the final AI prompt from the newsletter's template + story data.
//
// Reads: load_config (ai_prompt_template), json_to_csv (story data)
// Returns: prompt string ready for ghostwriter

const DEFAULT_PROMPT = `Always respond in valid JSON. Do not include any text before or after the JSON block.

Pick the best persona for these stories and give me their take for today's newsletter.
{{STORIES}}

Return it as JSON in the format:
{
  "ai_subject": "email subject line, max 60 characters",
  "ai_intro": "2-3 sentence opening paragraph. Hyperlink story mentions using Slack mrkdwn link syntax: <article_url|anchor text>. Use the article_url from the story data.",
  "ai_intro_html": "Identical wording to ai_intro, but use HTML links instead: <a href=\\"article_url\\">anchor text</a>. Use only inline HTML — no <div>, <p>, or block-level elements.",
  "ai_description": "one-line summary of today's edition"
}`;

export default defineComponent({
  async run({ steps, $ }) {
    const config = steps.load_config.$return_value;
    const storyData = JSON.stringify(steps.json_to_csv.$return_value);

    const template = config.ai_prompt_template || DEFAULT_PROMPT;
    const prompt = template.replace("{{STORIES}}", storyData);

    const source = config.ai_prompt_template ? "custom" : "default";
    $.export("$summary", `Built ${source} prompt for ${config.newsletter_key} (${storyData.length} chars of story data)`);
    return prompt;
  },
});
