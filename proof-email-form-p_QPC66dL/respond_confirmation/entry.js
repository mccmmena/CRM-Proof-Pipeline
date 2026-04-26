// Final HTTP response after a successful Braze send.

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

export default defineComponent({
  props: {
    displayName: { type: "string" },
    recipientEmail: { type: "string" },
  },
  async run({ $ }) {
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Proof sent</title>
<style>
  body{font:14px system-ui,-apple-system,sans-serif;max-width:520px;margin:60px auto;padding:0 20px;color:#111}
  h1{font-size:22px}
  .ok{background:#efe;border:1px solid #9c9;padding:14px;border-radius:4px;margin-top:16px}
  a{color:#06c;text-decoration:none}
  a:hover{text-decoration:underline}
</style></head>
<body>
  <h1>✅ Proof sent</h1>
  <div class="ok">
    Sent <strong>${escapeHtml(this.displayName)}</strong> to <strong>${escapeHtml(this.recipientEmail)}</strong>.
    Check your inbox in a minute.
  </div>
  <p style="margin-top:24px"><a href="./">← Send another</a></p>
</body></html>`;

    await $.respond({
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: html,
    });

    $.export("$summary", `Confirmation page returned for ${this.recipientEmail}`);
  },
});
