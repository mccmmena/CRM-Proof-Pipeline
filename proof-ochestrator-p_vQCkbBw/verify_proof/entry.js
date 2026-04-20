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
  // Capture the full <a> tag so we can extract anchor text
  const regex = /<a\s[^>]*href\s*=\s*["']([^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const url = match[1].trim();
    if (!url || url.startsWith("mailto:") || url.startsWith("#") || url.startsWith("tel:")) continue;
    if (seen.has(url)) continue;
    if (shouldSkipUrl(url)) continue;
    seen.add(url);
    // Strip HTML tags from anchor content to get readable text
    const anchorText = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    // Skip links that only wrap images — the AI checks broken images visually
    if (!anchorText) continue;
    links.push({ url, anchor: anchorText });
  }
  return links;
}

async function checkLink({ url, anchor }) {
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
    return { url, anchor, status: resp.status, ok: resp.ok, redirected: resp.redirected, finalUrl: resp.url };
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") {
      return { url, anchor, status: null, ok: false, error: "timeout" };
    }
    return { url, anchor, status: null, ok: false, error: e.message };
  }
}

async function verifyLinks(html) {
  const links = extractLinks(html).slice(0, MAX_LINKS);
  if (links.length === 0) return { checked: 0, failures: [], results: [] };

  const results = await Promise.all(links.map(checkLink));
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
  return `You are an email QA specialist visually reviewing newsletter screenshots before they are sent to subscribers.

You will receive screenshot images of the same email rendered in different email clients (iPhone, Gmail, Outlook, Apple Mail, etc.). Focus ONLY on what you can SEE in the screenshots.

Look for:
- **Broken layout**: misaligned columns, overlapping elements, content overflowing containers
- **Missing images**: broken image icons, empty boxes where images should be, missing thumbnails
- **Text problems**: garbled characters, encoding artifacts, unrendered template tags (e.g. "{{"), placeholder text
- **Clipped content**: email cut off abruptly, missing sections that appear in other clients
- **Dark mode issues**: unreadable text, invisible elements, colors that break in dark mode variants

Do NOT flag:
- Minor cosmetic differences between email clients (expected)
- Preheader text appearing at the top of the email (normal behavior)
- Slight font or spacing variations across clients

Return STRICT JSON:
{
  "needs_review": true or false,
  "issues": [
    { "severity": "high|medium|low", "description": "...", "location": "...", "client": "..." }
  ],
  "summary": "One-sentence overall assessment"
}

Rules:
- needs_review = TRUE only for issues a human should see before send
- "location" = where in the email (e.g. "hero image", "story 3 card", "footer")
- "client" = which email client screenshot shows the issue (or "all" if universal)
- Empty issues array is fine when the proof looks good
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

function buildUserContent({ subject, screenshots }) {
  const parts = [];

  parts.push({ type: "text", text: `**Newsletter subject:** ${subject || "(none)"}\n\nReview the following screenshots for visual issues:` });

  for (const s of screenshots) {
    parts.push({ type: "text", text: `**${s.name || s.client}:**` });
    parts.push({
      type: "image_url",
      image_url: { url: s.url, detail: "high" },
    });
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

    // 1. Link verification (reported separately, not sent to AI)
    const linkResults = await verifyLinks(rendered_html);
    console.log(`Checked ${linkResults.checked} links, ${linkResults.failures.length} failures`);

    // 2. Select representative screenshots for vision analysis
    const selectedScreenshots = selectScreenshots(screenshots, DEFAULT_CLIENTS);

    if (selectedScreenshots.length === 0) {
      console.warn("No screenshots available for visual analysis");
    }

    // 3. Call OpenAI GPT-4o — visual analysis only
    const userContent = buildUserContent({
      subject,
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
