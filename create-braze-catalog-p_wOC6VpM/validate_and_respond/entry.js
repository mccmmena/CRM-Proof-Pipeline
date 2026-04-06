// Validate the request and respond immediately.
//
// POST body:
// {
//   "catalog_name": "crm_trailhead_stories",
//   "description": "optional description",
//   "fields": [
//     "title:string",
//     "deck:string",
//     "image_url:string",
//     "active:boolean"
//   ]
// }
//
// If fields is omitted, uses the default newsletter story catalog schema.

const DEFAULT_FIELDS = [
  "title:string",
  "deck:string",
  "image_url:string",
  "article_url:string",
  "byline:string",
  "published_at:string",
  "active:boolean",
  "ai_subject:string",
  "ai_intro:string",
  "run_id:string",
  "generated_at:string",
];

export default defineComponent({
  async run({ steps, $ }) {
    const body = steps.trigger.event.body;

    if (!body?.catalog_name) {
      await $.respond({ status: 400, body: JSON.stringify({ error: "catalog_name is required" }) });
      return $.flow.exit("Missing catalog_name");
    }

    const catalog_name = body.catalog_name;
    const description = body.description || "";
    const fields = body.fields || DEFAULT_FIELDS;

    await $.respond({
      status: 202,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "accepted",
        catalog_name,
        fields_count: fields.length,
      }),
    });

    $.export("$summary", `Creating catalog: ${catalog_name}`);
    return { catalog_name, description, fields };
  },
});
