// Upsert stories into a Braze catalog from the CSV array produced by json_to_csv.
// Replaces @mcclatchy/braze-catalog-update — calls the Braze API directly.
//
// Input (sheetData): [ [headers...], [row1...], [row2...], ... ]
// The first element with value matching idField becomes the item "id".
// Braze PATCH /catalogs/{catalog_name}/items accepts up to 50 items per request.

import { axios } from "@pipedream/platform";

const BATCH_SIZE = 50;

export default defineComponent({
  props: {
    braze: {
      type: "app",
      app: "braze",
    },
    catalogName: {
      type: "string",
      label: "Catalog Name",
      description: "The Braze catalog to upsert items into",
    },
    sheetData: {
      type: "any",
      label: "Sheet Data",
      description: "CSV array: first row is headers, remaining rows are data",
    },
    idField: {
      type: "string",
      label: "ID Field",
      description: "Header name to use as the Braze item ID",
      default: "id",
    },
  },
  async run({ $ }) {
    const data = this.sheetData;
    if (!Array.isArray(data) || data.length < 2) {
      $.export("$summary", "No data to upsert");
      return { upserted: 0 };
    }

    const headers = data[0];
    const rows = data.slice(1);
    const idIndex = headers.indexOf(this.idField);

    if (idIndex === -1) {
      throw new Error(`ID field "${this.idField}" not found in headers: ${headers.join(", ")}`);
    }

    // Convert rows to Braze item objects
    const items = rows.map((row) => {
      const item = {};
      headers.forEach((header, i) => {
        if (header === this.idField) {
          item.id = String(row[i]);
        } else {
          item[header] = row[i] ?? "";
        }
      });
      return item;
    });

    const baseUrl = `https://${this.braze.$auth.instance_domain}.braze.${this.braze.$auth.region}`;
    let totalUpserted = 0;

    // Batch into groups of 50
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      await axios($, {
        method: "PATCH",
        url: `${baseUrl}/catalogs/${this.catalogName}/items`,
        headers: {
          Authorization: `Bearer ${this.braze.$auth.api_key}`,
          "Content-Type": "application/json",
        },
        data: { items: batch },
      });
      totalUpserted += batch.length;
    }

    $.export("$summary", `Upserted ${totalUpserted} items to ${this.catalogName}`);
    return { upserted: totalUpserted, catalog: this.catalogName };
  },
});
