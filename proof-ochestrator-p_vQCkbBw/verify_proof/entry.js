// Automated proof verification step.
// Evaluates the rendered email via three checks:
//   1. Link verification — HEAD request every <a href> in the HTML
//   2. Content extraction — strip HTML to plaintext for review
//   3. Visual + reasoning — send representative screenshots to OpenAI GPT-4o
//      along with link results and plaintext for a holistic QC verdict
//
// Returns: { needs_review, issues, summary, link_results, screenshots_analyzed }

import { axios } from "@pipedream/platform";

const DEFAULT_CLIENTS = ["iphone16_18", "gmailcom-lm", "m365_w11_lm"];
const LINK_TIMEOUT_MS = 10000;
const MAX_LINKS = 30;

// ── Link verification ──────────────────────────────────────────────────

// Domains to skip entirely (not worth checking)
const SKIP_DOMAINS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

function shouldSkipUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return SKIP_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function extractLinks(html) {
  const seen = new Set();
  const links = [];
  const regex = /href\s*=\s*["']([^"']*?)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const url = match[1].trim();
    if (!url || url.startsWith("mailto:") || url.startsWith("#") || url.startsWith("tel:")) continue;
    if (seen.has(url)) continue;
    if (shouldSkipUrl(url)) continue;
    seen.add(url);
    links.push(url);
  }
  return links;
}

async function checkLink(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LINK_TIMEOUT_MS);
  try {
    // Use GET — many tracking redirectors (clicks.mcclatchydc.com) reject HEAD
    const resp = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "McClatchy-ProofQC/1.0" },
    });
    clearTimeout(timeout);
    return { url, status: resp.status, ok: resp.ok, redirected: resp.redirected, finalUrl: resp.url };
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") {
      return { url, status: null, ok: false, error: "timeout" };
    }
    return { url, status: null, ok: false, error: e.message };
  }
}

async function verifyLinks(html) {
  const urls = extractLinks(html).slice(0, MAX_LINKS);
  if (urls.length === 0) return { checked: 0, failures: [], results: [] };

  const results = await Promise.all(urls.map(checkLink));
  const failures = results.filter((r) => !r.ok);
  return { checked: results.length, failures, results };
}

// ── Content extraction ─────────────────────────────────────────────────

function htmlToPlaintext(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── OpenAI vision + reasoning ──────────────────────────────────────────

function buildSystemPrompt() {
  return `You are an email QA specialist reviewing proofs before they are sent to subscribers.
You will receive:
1. Screenshot images of the email as rendered in various email clients
2. The plaintext content of the email
3. Link verification results (which URLs failed, if any)

Evaluate the proof for:
- **Rendering issues**: broken layout, overlapping text, missing or broken images, clipped content, alignment problems
- **Content issues**: placeholder text (e.g., "Lorem ipsum", "[INSERT]", "{{"), empty sections, encoding artifacts, garbled characters
- **Link issues**: broken links (4xx/5xx), timeouts, malformed URLs — use the provided link check results

Return STRICT JSON with exactly this structure:
{
  "needs_review": true or false,
  "issues": [
    { "type": "rendering|content|link", "severity": "high|medium|low", "description": "...", "location": "..." }
  ],
  "summary": "One-sentence overall assessment"
}

Rules:
- needs_review should be TRUE if there are any high-severity issues, or 2+ medium-severity issues
- needs_review should be FALSE if the proof looks clean and professional
- Be practical: minor cosmetic differences between email clients are expected and not issues
- Empty issues array is fine when the proof looks good
- "location" should pinpoint WHERE in the email the issue appears (e.g. "hero image", "story 3 thumbnail", "footer links", "subject line")
- "description" should say WHAT is wrong concisely — avoid vague phrasing
- Do not include any text outside the JSON object`;
}

function selectScreenshots(allScreenshots, preferredClients) {
  const selected = [];
  for (const client of preferredClients) {
    const match = allScreenshots.find((s) =>
      s.client.toLowerCase().includes(client.toLowerCase())
    );
    if (match) selected.push(match);
  }
  if (selected.length < 3) {
    for (const s of allScreenshots) {
      if (!selected.includes(s) && selected.length < 4) {
        selected.push(s);
      }
    }
  }
  return selected;
}

function buildUserContent({ plaintext, subject, linkResults, screenshots }) {
  const parts = [];

  let textBlock = `**Subject line:** ${subject || "(none)"}\n\n**Plaintext content:**\n${plaintext.slice(0, 3000)}`;

  if (linkResults.failures.length > 0) {
    const failLines = linkResults.failures
      .map((f) => `- ${f.url} → ${f.error || `HTTP ${f.status}`}`)
      .join("\n");
    textBlock += `\n\n**Link check failures (${linkResults.failures.length} of ${linkResults.checked}):**\n${failLines}`;
  } else {
    textBlock += `\n\n**Link check:** All ${linkResults.checked} links OK`;
  }

  parts.push({ type: "text", text: textBlock });

  for (const s of screenshots) {
    parts.push({
      type: "image_url",
      image_url: { url: s.url, detail: "low" },
    });
    parts.push({ type: "text", text: `Screenshot: ${s.client}` });
  }

  return parts;
}

// ── Main component ─────────────────────────────────────────────────────

export default defineComponent({
  props: {
    openai: {
      type: "app",
      app: "openai",
    },
    renderedHtml: {
      type: "string",
      label: "Rendered HTML",
      optional: true,
    },
    screenshots: {
      type: "any",
      label: "Screenshots",
      optional: true,
    },
    subject: {
      type: "string",
      label: "Subject",
      optional: true,
    },
  },
  async run({ $ }) {
    const rendered_html = this.renderedHtml;
    const screenshots = this.screenshots || [];
    const subject = this.subject || "";

    if (!rendered_html) {
      console.warn("No rendered HTML available — skipping verification");
      $.export("$summary", "Skipped — no rendered HTML");
      return { needs_review: false, issues: [], summary: "No rendered HTML available to verify", link_results: null, screenshots_analyzed: [] };
    }

    // 1. Link verification
    const linkResults = await verifyLinks(rendered_html);
    console.log(`Checked ${linkResults.checked} links, ${linkResults.failures.length} failures`);

    // 2. Content extraction
    const plaintext = htmlToPlaintext(rendered_html);

    // 3. Select representative screenshots for vision analysis
    const selectedScreenshots = selectScreenshots(screenshots, DEFAULT_CLIENTS);

    if (selectedScreenshots.length === 0) {
      console.warn("No screenshots available for visual analysis");
    }

    // 4. Call OpenAI GPT-4o
    const userContent = buildUserContent({
      plaintext,
      subject,
      linkResults,
      screenshots: selectedScreenshots,
    });

    const response = await axios($, {
      method: "POST",
      url: "https://api.openai.com/v1/chat/completions",
      headers: {
        Authorization: `Bearer ${this.openai.$auth.api_key}`,
        "Content-Type": "application/json",
      },
      data: {
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: userContent },
        ],
        temperature: 0.2,
        max_tokens: 1000,
      },
    });

    const content = response?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned no content for proof verification");
    }

    let verdict;
    try {
      verdict = JSON.parse(content);
    } catch (e) {
      throw new Error(`OpenAI returned invalid JSON: ${content}`);
    }

    const issueCount = verdict.issues?.length || 0;
    $.export(
      "$summary",
      verdict.needs_review
        ? `Review needed — ${issueCount} issue(s): ${verdict.summary}`
        : `Proof passed — ${verdict.summary}`
    );

    return {
      needs_review: verdict.needs_review,
      issues: verdict.issues || [],
      summary: verdict.summary || "",
      link_results: {
        checked: linkResults.checked,
        failures: linkResults.failures,
      },
      screenshots_analyzed: selectedScreenshots.map((s) => s.client),
    };
  },
});
