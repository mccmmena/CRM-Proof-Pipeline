// GET → render the form HTML using the newsletter list and exit.
// POST → validate inputs, look up the row's CANVAS_ID, return it for downstream steps.

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function renderForm(rows, { error, value } = {}) {
  const options = rows
    .map((r) => {
      const selected = value?.newsletter_key === r.NEWSLETTER_KEY ? " selected" : "";
      return `<option value="${escapeHtml(r.NEWSLETTER_KEY)}"${selected}>${escapeHtml(r.DISPLAY_NAME)}</option>`;
    })
    .join("\n      ");
  const errorHtml = error ? `<p class="err">${escapeHtml(error)}</p>` : "";
  const emailValue = escapeHtml(value?.email || "");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Email me a newsletter proof</title>
<style>
  body{font:14px system-ui,-apple-system,sans-serif;max-width:520px;margin:60px auto;padding:0 20px;color:#111}
  h1{font-size:22px;margin-bottom:4px}
  p.sub{color:#666;margin-top:0}
  label{display:block;margin-top:18px;font-weight:500}
  select,input,button{font:inherit;padding:10px 12px;width:100%;margin-top:6px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px}
  button{margin-top:24px;cursor:pointer;background:#111;color:#fff;border:0}
  button:hover{background:#333}
  .err{background:#fee;border:1px solid #f99;padding:10px;border-radius:4px;color:#900}
</style></head>
<body>
  <h1>Email me a newsletter proof</h1>
  <p class="sub">Pick a newsletter and we'll send the live rendered version to your inbox.</p>
  ${errorHtml}
  <form method="POST">
    <label>Newsletter
      <select name="newsletter_key" required>
        <option value="">Select a newsletter…</option>
        ${options}
      </select>
    </label>
    <label>Your email
      <input type="email" name="email" required value="${emailValue}" placeholder="you@mcclatchy.com">
    </label>
    <button type="submit">Send proof to my inbox</button>
  </form>
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
