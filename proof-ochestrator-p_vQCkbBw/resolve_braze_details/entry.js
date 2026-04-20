// Resolve a Braze canvas (or campaign) by ID to get its name and email template.
// Replaces @mcclatchy/utils-rebuild-braze-message — the orchestrator now only
// needs a canvas_id (or campaign_id) to look up everything it needs.

import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    braze: {
      type: "app",
      app: "braze",
    },
    canvasId: {
      type: "string",
      label: "Canvas ID",
      optional: true,
    },
    campaignId: {
      type: "string",
      label: "Campaign ID",
      optional: true,
    },
  },
  async run({ $ }) {
    const id = this.canvasId || this.campaignId;
    if (!id) {
      throw new Error("Either canvas_id or campaign_id is required");
    }

    const { instance_domain, region, api_key } = this.braze.$auth;
    const baseURL = `https://${instance_domain}.braze.${region}`;

    const isCanvas = Boolean(this.canvasId);
    const endpoint = isCanvas ? "/canvas/details" : "/campaigns/details";
    const paramKey = isCanvas ? "canvas_id" : "campaign_id";

    const response = await axios($, {
      method: "GET",
      baseURL,
      url: endpoint,
      headers: {
        Authorization: `Bearer ${api_key}`,
        "Content-Type": "application/json",
      },
      params: { [paramKey]: id },
    });

    const name = response.name;
    if (!name) {
      throw new Error(`Braze returned no name for ${paramKey}=${id}`);
    }

    // Extract the first email message from the response
    let body, subject;

    if (isCanvas) {
      // Canvas: steps[] → find first step with an email message variant
      const steps = response.steps || [];
      for (const step of steps) {
        const messages = step.messages || {};
        for (const variant of Object.values(messages)) {
          if (variant.channel === "email" && variant.body) {
            body = variant.body;
            subject = variant.subject;
            break;
          }
        }
        if (body) break;
      }
    } else {
      // Campaign: messages{} → find first email variant
      const messages = response.messages || {};
      for (const variant of Object.values(messages)) {
        if (variant.channel === "email" && variant.body) {
          body = variant.body;
          subject = variant.subject;
          break;
        }
      }
    }

    if (!body) {
      throw new Error(`No email message found in ${isCanvas ? "canvas" : "campaign"} "${name}"`);
    }

    // Replace canvas.name references with the actual name.
    // When sent via /messages/send instead of through the canvas,
    // Braze doesn't resolve canvas.* variables — we do it ourselves.
    body = body.replace(/\{\{\s*canvas\.\$\{name\}\s*\}\}/g, name);
    body = body.replace(/canvas\.\$\{name\}/g, name);
    if (subject) {
      subject = subject.replace(/\{\{\s*canvas\.\$\{name\}\s*\}\}/g, name);
      subject = subject.replace(/canvas\.\$\{name\}/g, name);
    }

    $.export("$summary", `Resolved ${isCanvas ? "canvas" : "campaign"} "${name}"`);
    return { name, email: { body, subject } };
  },
});
