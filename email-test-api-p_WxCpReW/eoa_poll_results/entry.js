import { axios } from "@pipedream/platform";

export default defineComponent({
  props: {
    email_on_acid: {
      type: "app",
      app: "email_on_acid",
    },
  },
  async run({ steps, $ }) {
    const testId = steps.eoa_create_test.$return_value.testId;
    const clients = steps.validate_and_respond.$return_value.clients;

    const auth = Buffer.from(
      `${this.email_on_acid.$auth.api_key}:${this.email_on_acid.$auth.account_password}`
    ).toString("base64");

    const response = await axios($, {
      method: "GET",
      url: `https://api.emailonacid.com/v5/email/tests/${testId}/results`,
      headers: { Authorization: `Basic ${auth}` },
    });

    const entries = Object.entries(response || {});
    const total = entries.length;
    const complete = entries.filter(
      ([, data]) => data.status === "Complete"
    ).length;
    const failed = entries.filter(
      ([, data]) => data.status === "Failed" || data.status === "Error"
    ).length;
    const pending = total - complete - failed;

    const runs = $.context.run.runs;
    const maxRuns = 30; // 30 × 30s = 15 min of polling
    const allDone = pending === 0 && total > 0;

    if (!allDone && runs < maxRuns) {
      console.log(
        `Attempt ${runs}/${maxRuns}: ${complete}/${total} complete, ${pending} pending. Re-running in 30s...`
      );
      $.flow.rerun(30000, null, maxRuns);
      return;
    }

    if (!allDone) {
      console.warn(
        `Timeout after ${runs} attempts. Returning ${complete}/${total} complete results.`
      );
    }

    const isFiltering = clients && clients.length > 0;
    const screenshots = entries
      .filter(([client]) => !isFiltering || clients.includes(client))
      .filter(([, data]) => data.status === "Complete")
      .map(([client, data]) => ({
        client,
        url: data.screenshots?.default || data.url,
      }))
      .filter((s) => s.url);

    $.export(
      "$summary",
      allDone
        ? `All complete: ${screenshots.length} screenshots`
        : `Timeout: ${screenshots.length}/${total} screenshots (${failed} failed)`
    );

    return {
      testId,
      screenshots,
      fullResults: response,
      status: allDone ? "complete" : "timeout",
      stats: { total, complete, failed, pending },
    };
  },
});
