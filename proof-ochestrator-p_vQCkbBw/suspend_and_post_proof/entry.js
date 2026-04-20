// Post a minimal proof message to the channel, then add detail as thread
// replies (AI content + buttons, QC verification, screenshots).  Suspend
// the workflow until a button click or timeout.
//
// Parent message is kept slim so #crm-team stays scannable.  The approve/
// reject buttons live on the first reply alongside the AI content.

import { axios } from "@pipedream/platform";

const CUTOFF_MINUTES_BEFORE_SEND = 10;

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
    driveFolderId: {
      type: "string",
      label: "Drive Campaign Folder ID",
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
  methods: {
    async postSlack($, { channel, thread_ts, text, blocks, unfurl_media }) {
      const data = { channel, text };
      if (thread_ts) data.thread_ts = thread_ts;
      if (blocks) data.blocks = blocks;
      if (unfurl_media !== undefined) data.unfurl_media = unfurl_media;

      const resp = await axios($, {
        method: "POST",
        url: "https://slack.com/api/chat.postMessage",
        headers: {
          Authorization: `Bearer ${this.slack.$auth.oauth_access_token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        data,
      });

      if (!resp.ok) {
        throw new Error(`Slack post failed: ${resp.error}`);
      }
      return resp;
    },
  },
  async run({ $ }) {
   try {
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
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });

    const aiSubject = aiContent.ai_subject || "";
    const aiIntro = aiContent.ai_intro || "";

    const channel = config.slack_channel_id || this.approval_channel;
    if (!channel) {
      throw new Error("No Slack channel — set SLACK_CHANNEL_ID in NEWSLETTER_CONFIG or the approval_channel prop");
    }

    // Get the resume URL before posting (workflow suspends at step end)
    const { resume_url, cancel_url } = $.flow.suspend(timeoutMs);
    const approveUrl = `${resume_url}?decision=approve`;
    const rejectUrl = `${resume_url}?decision=reject`;

    // ── Parent message (channel) ────────────────────────────────────────
    const hasHighIssues = verifyResult?.issues?.some((i) => i.severity === "high");
    const hasMediumIssues = verifyResult?.issues?.some((i) => i.severity === "medium");
    const hasLinkFailures = verifyResult?.link_results?.failures?.length > 0;
    const statusEmoji = hasHighIssues ? ":red_circle:" :
      (hasMediumIssues || hasLinkFailures) ? ":warning:" : ":large_green_circle:";

    const parent = await this.postSlack($, {
      channel,
      text: `${statusEmoji} *${config.display_name}* Proof _(${sendTime} send)_`,
    });

    const threadTs = parent.ts;

    // ── Reply 1: AI content + approve/reject buttons ────────────────────
    const reply1Blocks = [];

    if (aiSubject) {
      reply1Blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*AI Subject:*\n> ${aiSubject}` },
      });
    }
    if (aiIntro) {
      reply1Blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*AI Intro:*\n> ${aiIntro}` },
      });
    }

    if (reply1Blocks.length === 0) {
      reply1Blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: "_No AI content for this newsletter._" },
      });
    }

    reply1Blocks.push({ type: "divider" });
    reply1Blocks.push({
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
    reply1Blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: `Auto-rejects at T-${CUTOFF_MINUTES_BEFORE_SEND} min if no decision.` },
      ],
    });

    await this.postSlack($, {
      channel,
      thread_ts: threadTs,
      text: aiSubject ? `AI Subject: ${aiSubject}` : "Review & approve",
      blocks: reply1Blocks,
    });

    // ── Reply 2: QC verification ────────────────────────────────────────
    const verifyLines = [];

    // Visual issues from AI
    if (verifyResult?.issues?.length > 0) {
      const severityIcon = { high: ":red_circle:", medium: ":warning:", low: ":white_circle:" };
      const issueLines = verifyResult.issues
        .map((i) => {
          const loc = i.location ? ` — _${i.location}_` : "";
          const client = i.client && i.client !== "all" ? ` (${i.client})` : "";
          return `${severityIcon[i.severity] || ":warning:"} ${i.description}${loc}${client}`;
        })
        .join("\n");
      verifyLines.push(`*Visual Issues:*\n${issueLines}`);
    } else {
      verifyLines.push(`:large_green_circle: *No visual issues detected*`);
    }

    // Link check results (separate from AI)
    const linkResults = verifyResult?.link_results;
    if (linkResults?.failures?.length > 0) {
      const linkLines = linkResults.failures
        .slice(0, 5)
        .map((f) => {
          const label = f.anchor ? `"${f.anchor}"` : "(link)";
          const dest = f.finalUrl && f.finalUrl !== f.url ? f.finalUrl : f.url;
          return `• ${label} → ${f.error || `HTTP ${f.status}`}\n   ${dest}`;
        })
        .join("\n");
      verifyLines.push(`*Link Issues (${linkResults.failures.length} of ${linkResults.checked}):*\n${linkLines}`);
    } else if (linkResults) {
      verifyLines.push(`:link: All ${linkResults.checked} links OK`);
    }

    if (verifyResult?.summary) {
      verifyLines.push(`_${verifyResult.summary}_`);
    }

    await this.postSlack($, {
      channel,
      thread_ts: threadTs,
      text: verifyLines.join("\n\n"),
    });

    // ── Reply 3: iPhone screenshots (light + dark) + Drive folder link ──
    if (driveFiles.length > 0) {
      const blocks = [];

      // Show iPhone light and dark as full-size images
      const iphoneLight = driveFiles.find((f) => f.client === "iphone16_18" || (f.name || "").includes("iPhone 16 - iOS 18."));
      const iphoneDark = driveFiles.find((f) => f.client === "iphone16_18_dm" || (f.name || "").includes("iPhone 16 - iOS 18 Dark"));

      for (const f of [iphoneLight, iphoneDark].filter(Boolean)) {
        blocks.push({
          type: "image",
          image_url: `https://lh3.googleusercontent.com/d/${f.id}`,
          alt_text: f.client || f.name,
          title: { type: "plain_text", text: f.client || f.name },
        });
      }

      // Link to Drive folder for all other clients
      const driveFolderId = this.driveFolderId;
      if (driveFolderId) {
        blocks.push({
          type: "context",
          elements: [
            { type: "mrkdwn", text: `:file_folder: <https://drive.google.com/drive/folders/${driveFolderId}|View all ${driveFiles.length} screenshots in Drive>` },
          ],
        });
      }

      if (blocks.length > 0) {
        await this.postSlack($, {
          channel,
          thread_ts: threadTs,
          text: "Screenshots",
          blocks,
          unfurl_media: false,
        });
      }
    }

    $.export(
      "$summary",
      `Posted proof thread (${driveFiles.length > 0 ? "with screenshots" : "no screenshots"}) — auto-resumes in ${Math.round(timeoutMs / 60000)} min`
    );

    return {
      posted: true,
      run_id: run.run_id,
      channel: parent.channel,
      ts: threadTs,
      timeoutMs,
      cancel_url,
    };
   } catch (err) {
    const alertChannel = this.config?.slack_channel_id || this.approval_channel;
    if (alertChannel) {
      try {
        await this.postSlack($, {
          channel: alertChannel,
          text: `:rotating_light: *Proof Orchestrator* failed in \`suspend_and_post_proof\`\n> ${err.message}`,
        });
      } catch (slackErr) {
        console.error("Slack alert failed:", slackErr.message);
      }
    }
    throw err;
   }
  },
});
