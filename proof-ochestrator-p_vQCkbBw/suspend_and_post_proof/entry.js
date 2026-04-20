// Build a Block Kit proof message with AI preview, screenshot links,
// and approve/reject URL buttons, then post to Slack and suspend the
// workflow until a button click or timeout.
//
// AI content comes from the fetch_ai_content step (no longer fetched here).
// The timeout is set to (next_send_time - 10 min - now), so suspension
// auto-resolves at the approval cutoff.

import { axios } from "@pipedream/platform";

const CUTOFF_MINUTES_BEFORE_SEND = 10;

function buildBlocks({ run, aiSubject, aiIntro, sendTime, driveFiles, approveUrl, rejectUrl, verifyResult }) {
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

  // Verification results (from verify_proof step)
  if (verifyResult?.issues?.length > 0) {
    const severityIcon = { high: ":red_circle:", medium: ":warning:", low: ":white_circle:" };
    const issueLines = verifyResult.issues
      .map((i) => `${severityIcon[i.severity] || ":warning:"} [${i.type}] ${i.description}`)
      .join("\n");
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Issues Found:*\n${issueLines}` },
    });
  } else {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `:large_green_circle: *Proof passed automated QC* — no rendering issues detected` },
    });
  }

  if (verifyResult?.summary) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `_AI Assessment: ${verifyResult.summary}_` }],
    });
  }

  blocks.push({ type: "divider" });

  // Screenshots from Google Drive
  if (driveFiles && driveFiles.length > 0) {
    const links = driveFiles
      .slice(0, 10)
      .map((f) => `<https://drive.google.com/uc?export=view&id=${f.id}|${f.client || f.name}>`)
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
    approval_channel: {
      type: "string",
      label: "Slack Approval Channel ID",
      description: "Fallback channel ID if not set in NEWSLETTER_CONFIG",
      optional: true,
    },
    config: {
      type: "any",
      label: "Newsletter Config",
    },
    driveFiles: {
      type: "any",
      label: "Drive Uploaded Files",
      optional: true,
    },
    verifyResult: {
      type: "any",
      label: "Verify Proof Result",
      optional: true,
    },
    nextSendTime: {
      type: "string",
      label: "Next Send Time",
    },
    contentPrepResume: {
      type: "any",
      label: "Content Prep Resume Data",
      optional: true,
    },
    aiContent: {
      type: "any",
      label: "AI Content from Braze Catalog",
      optional: true,
    },
  },
  async run({ $ }) {
    const config = this.config;
    const driveFiles = this.driveFiles || [];
    const verifyResult = this.verifyResult;
    const aiContent = this.aiContent || {};

    const contentPrepResume = this.contentPrepResume || {};
    const run = {
      run_id: contentPrepResume.run_id || "unknown",
      newsletter_key: config.newsletter_key,
      braze_catalog_id: config.braze_catalog_id,
      next_send_time: this.nextSendTime,
    };

    // Compute suspend timeout = (next_send_time - CUTOFF - now), in ms
    const sendTs = new Date(this.nextSendTime).getTime();
    const cutoffMs = sendTs - CUTOFF_MINUTES_BEFORE_SEND * 60 * 1000 - Date.now();
    const timeoutMs = Math.max(cutoffMs, 60 * 1000); // minimum 1 min

    const sendTime = new Date(this.nextSendTime).toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const aiSubject = aiContent.ai_subject || "";
    const aiIntro = aiContent.ai_intro || "";

    const channel = config.slack_channel_id || this.approval_channel;
    if (!channel) {
      throw new Error("No Slack channel — set SLACK_CHANNEL_ID in NEWSLETTER_CONFIG or the approval_channel prop");
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
      driveFiles,
      approveUrl,
      rejectUrl,
      verifyResult,
    });

    const response = await axios($, {
      method: "POST",
      url: "https://slack.com/api/chat.postMessage",
      headers: {
        Authorization: `Bearer ${this.slack.$auth.oauth_access_token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      data: {
        channel,
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
