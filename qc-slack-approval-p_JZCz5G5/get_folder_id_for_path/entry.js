import { axios } from "@pipedream/platform";
import google_drive from "@pipedream/google_drive";

export default defineComponent({
  props: {
    google_drive,
    drive: {
      type: "string",
      label: "Shared Drive ID",
      description: "The ID of the shared drive to search in",
    },
    path: {
      type: "string",
      label: "Folder Path",
      description: "Slash-separated folder path (e.g. 2026-04-23/Campaign Name)",
    },
  },
  async run({ $ }) {
    const segments = this.path.split("/").filter(Boolean);
    let parentId = this.drive;

    for (const segment of segments) {
      const resp = await axios($, {
        url: "https://www.googleapis.com/drive/v3/files",
        headers: {
          Authorization: `Bearer ${this.google_drive.$auth.oauth_access_token}`,
        },
        params: {
          q: `name = '${segment.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          driveId: this.drive,
          corpora: "drive",
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          fields: "files(id,name)",
        },
      });

      if (!resp.files || resp.files.length === 0) {
        throw new Error(`Folder not found: "${segment}" in path "${this.path}"`);
      }

      parentId = resp.files[0].id;
    }

    $.export("$summary", `Resolved path "${this.path}" to folder ${parentId}`);
    return parentId;
  },
});
