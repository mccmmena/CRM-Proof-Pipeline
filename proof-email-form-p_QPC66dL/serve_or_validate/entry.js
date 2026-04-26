// GET → render the form HTML using the newsletter list and exit.
// POST → validate inputs, look up the row's CANVAS_ID, return it for downstream steps.

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderForm(rows, { error, value } = {}) {
  const buttons = rows
    .map(
      (r) =>
        `<button type="submit" name="newsletter_key" value="${escapeHtml(r.NEWSLETTER_KEY)}">${escapeHtml(r.DISPLAY_NAME)}</button>`
    )
    .join("\n      ");
  const errorHtml = error ? `<p class="err">${escapeHtml(error)}</p>` : "";
  const emailValue = escapeHtml(value?.email || "");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Email me a newsletter proof</title>
<style>
  body{font:14px system-ui,-apple-system,sans-serif;max-width:560px;margin:60px auto;padding:0 20px;color:#111}
  h1{font-size:22px;margin-bottom:4px}
  p.sub{color:#666;margin-top:0}
  label{display:block;margin-top:18px;font-weight:500}
  input{font:inherit;padding:10px 12px;width:100%;margin-top:6px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px}
  .buttons{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}
  .buttons button{font:inherit;padding:14px 12px;cursor:pointer;background:#111;color:#fff;border:0;border-radius:4px;text-align:left}
  .buttons button:hover{background:#06c}
  .err{background:#fee;border:1px solid #f99;padding:10px;border-radius:4px;color:#900}
  .hint{color:#666;font-size:13px;margin-top:24px}
</style></head>
<body>
  <h1>Email me a newsletter proof</h1>
  <p class="sub">Enter your email, then click a newsletter to send the live rendered version to your inbox.</p>
  ${errorHtml}
  <form method="POST">
    <label>Your email
      <input type="email" name="email" required value="${emailValue}" placeholder="you@mcclatchy.com">
    </label>
    <div class="buttons">
      ${buttons}
    </div>
  </form>
  <p class="hint">Subjects arrive prefixed with <code>[PROOF]</code>. Allow up to a minute for delivery.</p>
</body></html>`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default defineComponent({
  async run({ steps, $ }) {
    const rows = steps.load_newsletters?.$return_value || [];
    const method = (steps.trigger.event.method || "GET").toUpperCase();

    if (method !== "POST") {
      await $.respond({
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: renderForm(rows),
      });
      return $.flow.exit("Served form");
    }

    const body = steps.trigger.event.body || {};
    const newsletterKey = (body.newsletter_key || "").trim();
    const email = (body.email || "").trim();

    const respondError = async (msg) => {
      await $.respond({
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: renderForm(rows, { error: msg, value: { newsletter_key: newsletterKey, email } }),
      });
      return $.flow.exit(msg);
    };

    if (!newsletterKey) return respondError("Please select a newsletter.");
    if (!EMAIL_RE.test(email)) return respondError("Please enter a valid email address.");

    const row = rows.find((r) => r.NEWSLETTER_KEY === newsletterKey);
    if (!row) return respondError("Selected newsletter not found or not enabled.");
    if (!row.CANVAS_ID) return respondError("This newsletter has no canvas configured.");

    $.export("$summary", `Validated request for "${row.DISPLAY_NAME}" → ${email}`);
    return {
      canvas_id: row.CANVAS_ID,
      newsletter_key: row.NEWSLETTER_KEY,
      display_name: row.DISPLAY_NAME,
      recipient_email: email,
    };
  },
});
