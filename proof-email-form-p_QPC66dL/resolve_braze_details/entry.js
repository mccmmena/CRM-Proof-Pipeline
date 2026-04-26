// Resolve a Braze canvas (or campaign) by ID and return its email body/subject/preheader.
// Trimmed copy of proof-ochestrator/resolve_braze_details — no Slack alerting,
// just throw on failure (the workflow is short and a thrown error surfaces in Pipedream).

import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    braze: { type: "app", app: "braze" },
    canvasId: { type: "string", optional: true },
    campaignId: { type: "string", optional: true },
  },
  async run({ $ }) {
    const id = this.canvasId || this.campaignId;
    if (!id) throw new Error("Either canvas_id or campaign_id is required");

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
    if (!name) throw new Error(`Braze returned no name for ${paramKey}=${id}`);

    let body, subject, preheader;

    if (isCanvas) {
      const steps = response.steps || response.components || [];
      const stepMap = new Map(steps.map((s) => [s.id || s.component_id, s]));
      const entryIds = (response.variants || []).flatMap((v) =>
        v.first_step_ids || v.first_component_ids || [v.first_step_id].filter(Boolean)
      );
      const reachable = new Set();
      const queue = [...entryIds];
      while (queue.length) {
        const sid = queue.shift();
        if (reachable.has(sid)) continue;
        reachable.add(sid);
        const s = stepMap.get(sid);
        if (!s) continue;
        const nextIds = [
          ...(s.next_step_ids || []),
          ...(s.next_paths || []).map((p) => p.next_step_id).filter(Boolean),
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

    // When sending via /messages/send, Braze doesn't resolve canvas.* variables — do it here.
    body = body.replace(/\{\{\s*canvas\.\$\{name\}\s*\}\}/g, name);
    body = body.replace(/canvas\.\$\{name\}/g, name);
    if (subject) {
      subject = subject.replace(/\{\{\s*canvas\.\$\{name\}\s*\}\}/g, name);
      subject = subject.replace(/canvas\.\$\{name\}/g, name);
    }

    $.export("$summary", `Resolved ${isCanvas ? "canvas" : "campaign"} "${name}"`);
    return { name, email: { body, subject, preheader } };
  },
});
