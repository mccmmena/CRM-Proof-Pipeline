import { axios } from "@pipedream/platform";

export default {
  name: "Trigger Workflow for Each Item",
  version: "0.0.3",
  key: "utils-trigger-workflow-for-each",
  description: "Triggers a specified workflow for each item in an array sequentially.",
  type: "action",
  props: {
    items: {
      type: "any",
      label: "Items",
      description: "The list of objects to process.",
    },
    workflowUrl: {
      type: "string",
      label: "Workflow URL",
      description: "The URL of the workflow to trigger for each item (e.g., https://eoxxxxxxxxxx.m.pipedream.net)",
    },
  },
  async run({ $ }) {
    if (!Array.isArray(this.items)) {
      throw new Error("The 'Items' prop must be an array.");
    }

    const { workflowUrl } = this;
    const items = this.items;
    
    let successCount = 0;
    let failCount = 0;

    for (const item of items) {
        try {
            await axios($, {
                method: "POST",
                url: workflowUrl,
                data: item,
            });
            successCount++;
        } catch (error) {
             console.error(`Error processing item: ${error.message}`);
             failCount++;
        }
    }

    $.export("$summary", `Successfully triggered workflow for ${successCount} items. (${failCount} failed)`);
    return this.items;
  },
};
