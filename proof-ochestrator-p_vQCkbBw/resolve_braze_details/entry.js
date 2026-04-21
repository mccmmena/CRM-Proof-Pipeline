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
    slack: {
      type: "app",
      app: "slack",
    },
    alert_channel: {
      type: "string",
      label: "Error Alert Channel ID",
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
   try {
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
    let body, subject, preheader;

    if (isCanvas) {
      // Canvas: walk the step graph from entry points so we skip disconnected steps.
      // Handles both Standard (next_step_ids) and Flow (next_paths) canvas formats,
      // and both step.id and step.component_id identifiers.
      const steps = response.steps || response.components || [];
      const stepMap = new Map(steps.map(s => [s.id || s.component_id, s]));

      // Collect entry points from variants (handle multiple naming conventions)
      const entryIds = (response.variants || []).flatMap(v =>
        v.first_step_ids || v.first_component_ids || [v.first_step_id].filter(Boolean)
      );

      // BFS to find all reachable steps
      const reachable = new Set();
      const queue = [...entryIds];
      while (queue.length) {
        const sid = queue.shift();
        if (reachable.has(sid)) continue;
        reachable.add(sid);
        const s = stepMap.get(sid);
        if (!s) continue;
        // Standard canvas: next_step_ids; Flow canvas: next_paths
        const nextIds = [
          ...(s.next_step_ids || []),
          ...(s.next_paths || []).map(p => p.next_step_id).filter(Boolean),
        ];
        queue.push(...nextIds);
      }

      for (const step of steps) {
        const stepId = step.id || step.component_id;
        if (reachable.size > 0 && !reachable.has(stepId)) continue;
        const messages = step.messages || {};
        for (const variant of Object.values(messages)) {
          if (variant.channel === "email" && variant.body) {
            body = variant.body;
            subject = variant.subject;
            preheader = variant.preheader || "";
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
          preheader = variant.preheader || "";
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
    return { name, email: { body, subject, preheader } };
   } catch (err) {
    try {
      await axios($, {
        method: "POST",
        url: "https://slack.com/api/chat.postMessage",
        headers: {
          Authorization: `Bearer ${this.slack.$auth.oauth_access_token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        data: {
          channel: this.alert_channel,
          text: `:rotating_light: *Proof Orchestrator* failed in \`resolve_braze_details\`\n> ${err.message}`,
        },
      });
    } catch (slackErr) {
      console.error("Slack alert failed:", slackErr.message);
    }
    throw err;
   }
  },
});
