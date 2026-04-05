// Posts the proof message to Slack. Two modes:
//   1. Newsletter with pending run: Block Kit message with AI preview +
//      Approve/Reject buttons + screenshot image blocks.
//   2. Non-newsletter: plain markdown message (existing behavior).
//
// After posting, writes slack_channel + slack_ts back to NEWSLETTER_RUNS so
// the interactivity handler can chat.update later.
//
// NOTE: Currently disabled for safety. Enable after Slack interactivity URL
// is registered and SLACK_APPROVAL_CHANNEL env var is set. The workflow.yaml
// should also have this step marked disabled: true until the user is ready.

import { axios } from "@pipedream/platform";

function buildBlocks({ run, sendTime, screenshots }) {
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

  if (run.ai_subject) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*AI Subject:*\n> ${run.ai_subject}` },
    });
  }

  if (run.ai_intro) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*AI Intro:*\n> ${run.ai_intro}` },
    });
  }

  blocks.push({ type: "divider" });

  // Screenshot links as a section (image blocks would require public URLs)
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
        action_id: "approve_ai",
        value: `${run.run_id}|APPROVE|${run.newsletter_key}`,
      },
      {
        type: "button",
        style: "danger",
        text: { type: "plain_text", text: "Reject (use defaults)" },
        action_id: "reject_ai",
        value: `${run.run_id}|REJECT|${run.newsletter_key}`,
        confirm: {
          title: { type: "plain_text", text: "Reject AI content?" },
          text: {
            type: "plain_text",
            text: "Template will fall back to default subject and intro.",
          },
          confirm: { type: "plain_text", text: "Reject" },
          deny: { type: "plain_text", text: "Cancel" },
          style: "danger",
        },
      },
    ],
  });

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "Auto-rejects 10 minutes before send if no decision.",
      },
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
    snowflake: {
      type: "app",
      app: "snowflake",
    },
    approval_channel: {
      type: "string",
      label: "Slack Approval Channel ID",
      description: "Channel ID where proof + approval message is posted",
      optional: true,
    },
    dry_run: {
      type: "boolean",
      label: "Dry Run (don't post to Slack)",
      default: true,
    },
  },
  async run({ steps, $ }) {
    const run = steps.lookup_newsletter_run.$return_value;
    const body = steps.trigger.event.body;
    const screenshots =
      steps.eoa_get_screenshot?.$return_value?.screenshots || [];

    const sendTime = new Date(body.next_send_time).toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    });

    // If no newsletter run, fall back to plain message (existing behavior)
    // — leave this to the existing send_message step or send a simple text here
    if (!run) {
      $.export(
        "$summary",
        "No newsletter run — would post plain message (or fall through to existing send_message step)"
      );
      return { posted: false, reason: "no_newsletter_run" };
    }

    // DRY RUN: build payload but don't actually post
    const blocks = buildBlocks({ run, sendTime, screenshots });
    const payload = {
      channel: this.approval_channel,
      text: `Proof ready for ${run.newsletter_key}`,
      blocks,
    };

    if (this.dry_run || !this.approval_channel) {
      $.export(
        "$summary",
        `DRY RUN — would post ${blocks.length} blocks for run ${run.run_id}`
      );
      return { posted: false, dry_run: true, payload };
    }

    // Live post via Slack Web API
    const response = await axios($, {
      method: "POST",
      url: "https://slack.com/api/chat.postMessage",
      headers: {
        Authorization: `Bearer ${this.slack.$auth.oauth_access_token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      data: payload,
    });

    if (!response.ok) {
      throw new Error(`Slack post failed: ${response.error}`);
    }

    // Write channel + ts back to NEWSLETTER_RUNS so interactivity handler
    // can chat.update later
    await this.snowflake.executeQuery({
      sqlText: `
        UPDATE CRM_OPS.NEWSLETTER.NEWSLETTER_RUNS
        SET SLACK_CHANNEL_ID = ?,
            SLACK_MESSAGE_TS = ?
        WHERE RUN_ID = ?
      `,
      binds: [response.channel, response.ts, run.run_id],
    });

    $.export(
      "$summary",
      `Posted approval message for run ${run.run_id} to channel ${response.channel}`
    );

    return { posted: true, channel: response.channel, ts: response.ts };
  },
});
