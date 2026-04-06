// Post the proof message to Slack and suspend the workflow waiting for an
// approval decision.
//
// Two modes:
//   1. Newsletter run found (from lookup_newsletter_run): reads AI content
//      from the Braze catalog meta row, builds a Block Kit message with
//      AI preview + screenshot links + two URL buttons (approve/reject),
//      posts to Slack, then calls $.flow.suspend(timeoutMs) to pause the
//      workflow until a button is clicked OR the timeout fires. The timeout
//      is set to (next_send_time - 10 min - now), so suspension auto-resolves
//      at the approval cutoff.
//
//      The buttons are URL buttons, both pointing at the same resume_url
//      with different query params:
//        ${resume_url}?decision=approve
//        ${resume_url}?decision=reject
//      On resume, apply_decision reads the decision and branches.
//
//   2. No newsletter run: posts a plain message (existing behavior) and
//      returns without suspending. Workflow continues/ends normally.
//
// Dry run default: true. When true, the Slack post is skipped entirely and
// the step returns the payload it would have posted, without suspending.

import { axios } from "@pipedream/platform";

const CUTOFF_MINUTES_BEFORE_SEND = 10;

function buildBlocks({ run, aiSubject, aiIntro, sendTime, screenshots, approveUrl, rejectUrl }) {
  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `${run.newsletter_key} — Proof Ready` },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Sends:*\n${sendTime}` },
        { type: "mrkdwn", text: `*Run ID:*\n\`${run.run_id}\`` },
      ],
    },
  ];

  if (aiSubject) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*AI Subject:*\n> ${aiSubject}` },
    });
  }
  if (aiIntro) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*AI Intro:*\n> ${aiIntro}` },
    });
  }

  blocks.push({ type: "divider" });

  if (screenshots && screenshots.length > 0) {
    const links = screenshots
      .slice(0, 10)
      .map((s) => `<${s.url}|${s.client}>`)
      .join(" · ");
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Screenshots:* ${links}` },
    });
  }

  blocks.push({
    type: "actions",
    block_id: "approval_actions",
    elements: [
      {
        type: "button",
        style: "primary",
        text: { type: "plain_text", text: "Approve" },
        url: approveUrl,
      },
      {
        type: "button",
        style: "danger",
        text: { type: "plain_text", text: "Reject (use defaults)" },
        url: rejectUrl,
      },
    ],
  });

  blocks.push({
    type: "context",
    elements: [
      { type: "mrkdwn", text: `Auto-rejects at T-${CUTOFF_MINUTES_BEFORE_SEND} min if no decision.` },
    ],
  });

  return blocks;
}

export default defineComponent({
  props: {
    slack: {
      type: "app",
      app: "slack",
    },
    braze: {
      type: "app",
      app: "braze",
    },
    approval_channel: {
      type: "string",
      label: "Slack Approval Channel ID",
      description: "Channel ID (e.g. C0123456789) where the approval message is posted",
      optional: true,
    },
    dry_run: {
      type: "boolean",
      label: "Dry Run (don't post to Slack and don't suspend)",
      default: true,
    },
  },
  async run({ steps, $ }) {
    const config = steps.check_config?.$return_value;
    const contentPrep = steps.suspend_for_content_prep?.$return_value;
    const body = steps.trigger.event.body;
    const screenshots =
      steps.extract_screenshots?.$return_value?.screenshots || [];

    // Non-newsletter proof → skip
    if (!config || !contentPrep?.triggered) {
      $.export(
        "$summary",
        "No newsletter config — skipping Block Kit post (non-newsletter proof)"
      );
      return { posted: false, reason: "no_newsletter_run" };
    }

    // Build a run object from check_config + content-prep resume data
    // Content-prep resume body: { status, run_id, newsletter_key, ai_subject, ai_intro }
    const contentPrepResume = $.context?.resume_history?.[0]?.body || {};
    const run = {
      run_id: contentPrepResume.run_id || "unknown",
      newsletter_key: config.newsletter_key,
      braze_catalog_id: config.braze_catalog_id,
      ai_subject: contentPrepResume.ai_subject || "",
      ai_intro: contentPrepResume.ai_intro || "",
      next_send_time: body.next_send_time,
    };

    // Compute suspend timeout = (next_send_time - CUTOFF - now), in ms
    const sendTs = new Date(body.next_send_time).getTime();
    const cutoffMs = sendTs - CUTOFF_MINUTES_BEFORE_SEND * 60 * 1000 - Date.now();
    const timeoutMs = Math.max(cutoffMs, 60 * 1000); // minimum 1 min

    const sendTime = new Date(body.next_send_time).toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    });

    // Read AI content fresh from the Braze catalog meta row so we show
    // exactly what the template will use at send time.
    let aiSubject = run.ai_subject;
    let aiIntro = run.ai_intro;
    try {
      const metaResp = await axios($, {
        method: "GET",
        url: `https://${this.braze.$auth.instance_domain}.braze.${this.braze.$auth.region}/catalogs/${run.braze_catalog_id || ""}/items/meta`,
        headers: {
          Authorization: `Bearer ${this.braze.$auth.api_key}`,
        },
      });
      aiSubject = metaResp?.item?.ai_subject || aiSubject;
      aiIntro = metaResp?.item?.ai_intro || aiIntro;
    } catch (e) {
      console.warn("Could not fetch meta row from Braze, using Snowflake values:", e.message);
    }

    if (this.dry_run || !this.approval_channel) {
      const blocks = buildBlocks({
        run,
        aiSubject,
        aiIntro,
        sendTime,
        screenshots,
        approveUrl: "https://example.invalid/approve",
        rejectUrl: "https://example.invalid/reject",
      });
      $.export(
        "$summary",
        `DRY RUN — would post ${blocks.length} blocks and suspend for ${Math.round(timeoutMs / 60000)} min`
      );
      return { posted: false, dry_run: true, run_id: run.run_id, timeoutMs, blocks };
    }

    // Suspend the workflow. Pipedream returns resume_url + cancel_url.
    // We use resume_url with query params for both buttons so we can tell
    // approve vs reject apart when the workflow wakes up.
    const { resume_url } = $.flow.suspend(timeoutMs);
    const approveUrl = `${resume_url}?decision=approve`;
    const rejectUrl = `${resume_url}?decision=reject`;

    const blocks = buildBlocks({
      run,
      aiSubject,
      aiIntro,
      sendTime,
      screenshots,
      approveUrl,
      rejectUrl,
    });

    const response = await axios($, {
      method: "POST",
      url: "https://slack.com/api/chat.postMessage",
      headers: {
        Authorization: `Bearer ${this.slack.$auth.oauth_access_token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      data: {
        channel: this.approval_channel,
        text: `Proof ready for ${run.newsletter_key}`,
        blocks,
      },
    });

    if (!response.ok) {
      throw new Error(`Slack post failed: ${response.error}`);
    }

    $.export(
      "$summary",
      `Posted and suspended — will auto-resume in ${Math.round(timeoutMs / 60000)} min if no click`
    );

    return {
      posted: true,
      run_id: run.run_id,
      channel: response.channel,
      ts: response.ts,
      timeoutMs,
    };
  },
});
