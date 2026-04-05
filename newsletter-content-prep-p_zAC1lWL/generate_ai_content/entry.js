// Call OpenAI to generate an email subject line and intro based on the
// locked story set. Uses JSON mode for strict output.
//
// Returns: { ai_subject, ai_intro, ai_model, raw }

import { axios } from "@pipedream/platform";

const DEFAULT_SYSTEM_PROMPT = `You are a newsroom copy editor writing email subject lines and intros.
Given a list of today's top stories, return STRICT JSON with exactly these fields:
{
  "subject": "...",
  "intro": "..."
}

Rules:
- subject: max 60 characters, no emoji, no clickbait
- intro: 2-3 sentences, conversational, summarizes the day's themes
- Do not include any text outside the JSON object`;

export default defineComponent({
  props: {
    openai: {
      type: "app",
      app: "openai",
    },
  },
  async run({ steps, $ }) {
    const { ai_prompt_template, ai_model, display_name } =
      steps.load_config.$return_value;
    const { stories } = steps.fetch_feed.$return_value;

    const system = ai_prompt_template || DEFAULT_SYSTEM_PROMPT;

    const storyLines = stories
      .map((s, i) => `${i + 1}. ${s.title}${s.deck ? ` — ${s.deck}` : ""}`)
      .join("\n");

    const userMsg = `Newsletter: ${display_name}\n\nStories:\n${storyLines}`;

    const response = await axios($, {
      method: "POST",
      url: "https://api.openai.com/v1/chat/completions",
      headers: {
        Authorization: `Bearer ${this.openai.$auth.api_key}`,
        "Content-Type": "application/json",
      },
      data: {
        model: ai_model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        temperature: 0.7,
      },
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned no content");
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      throw new Error(`OpenAI returned invalid JSON: ${content}`);
    }

    if (!parsed.subject || !parsed.intro) {
      throw new Error(
        `OpenAI output missing subject or intro: ${JSON.stringify(parsed)}`
      );
    }

    $.export("$summary", `Generated AI subject: "${parsed.subject}"`);

    return {
      ai_subject: parsed.subject,
      ai_intro: parsed.intro,
      ai_model,
      raw: response,
    };
  },
});
