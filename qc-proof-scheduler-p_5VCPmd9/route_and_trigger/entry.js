// For each filtered Braze scheduled item, route to the correct proof
// orchestrator workflow using PROOF_WORKFLOW_URL from NEWSLETTER_CONFIG.
//
// Reads: steps.load_newsletter_routes.$return_value (Snowflake query result)
//        steps.utils_filter_by_tags.$return_value (filtered items array)
//
// Items whose name matches a NEWSLETTER_KEY are POSTed to their configured
// workflow URL. Items without a match are skipped (not newsletters).

import { axios } from "@pipedream/platform";

// Map Braze schedule_type to IANA timezone for offset calculation.
const TZ_MAP = {
  "Eastern Time (US & Canada)": "America/New_York",
  "Central Time (US & Canada)": "America/Chicago",
  "Mountain Time (US & Canada)": "America/Denver",
  "Pacific Time (US & Canada)": "America/Los_Angeles",
};

// Append the correct UTC offset to a naive datetime string.
// e.g. "2026-04-20T13:20:00" + "Eastern Time (US & Canada)" → "2026-04-20T13:20:00-04:00"
function appendOffset(naiveDatetime, scheduleType) {
  const tz = TZ_MAP[scheduleType];
  if (!tz || !naiveDatetime) return naiveDatetime;

  // Build a Date in the target timezone to find its UTC offset
  const dt = new Date(naiveDatetime + "Z"); // treat as UTC temporarily
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "longOffset",
  });
  const parts = fmt.formatToParts(dt);
  const offsetPart = parts.find((p) => p.type === "timeZoneName");
  // offsetPart.value is like "GMT-04:00" or "GMT+05:30"
  const offset = offsetPart?.value?.replace("GMT", "") || "";
  return offset ? `${naiveDatetime}${offset}` : naiveDatetime;
}

export default defineComponent({
  props: {
    items: {
      type: "any",
      label: "Items",
      description: "The list of Braze scheduled items to route.",
    },
  },
  async run({ steps, $ }) {
    if (!Array.isArray(this.items)) {
      throw new Error("The 'Items' prop must be an array.");
    }

    // Build a map of newsletter_key → workflow URL from the built-in Snowflake step
    const routes = steps.load_newsletter_routes?.$return_value || [];
    const routeMap = new Map(
      routes.map((r) => [r.NEWSLETTER_KEY, r.PROOF_WORKFLOW_URL])
    );

    if (routeMap.size === 0) {
      $.export("$summary", "No enabled newsletters with workflow URLs — nothing to route");
      return { total: this.items.length, triggered: 0, skipped: this.items.length, failed: 0 };
    }

    let triggered = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of this.items) {
      const key = item.name || item.campaign_name || item.canvas_name;
      const workflowUrl = key && routeMap.get(key);

      if (!workflowUrl) {
        console.log(`Skipping "${key || "(no name)"}" — not in NEWSLETTER_CONFIG`);
        skipped++;
        continue;
      }

      // Send minimal payload — the orchestrator resolves everything else from the ID
      const payload = {
        canvas_id: item.id,
        next_send_time: appendOffset(item.next_send_time, item.schedule_type),
      };

      try {
        await axios($, {
          method: "POST",
          url: workflowUrl,
          data: payload,
        });
        triggered++;
      } catch (error) {
        console.error(`Failed to trigger workflow for "${key}":`, error.message);
        failed++;
      }
    }

    $.export(
      "$summary",
      `Triggered ${triggered} newsletter(s), skipped ${skipped}, failed ${failed} (of ${this.items.length} total)`
    );

    return { total: this.items.length, triggered, skipped, failed };
  },
});
