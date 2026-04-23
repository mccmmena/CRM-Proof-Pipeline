import { axios } from "@pipedream/platform";
import google_drive from "@pipedream/google_drive";

export default defineComponent({
  props: {
    google_drive,
    drive: {
      type: "string",
      label: "Shared Drive ID",
      description: "The ID of the shared drive",
    },
    folderId: {
      type: "string",
      label: "Folder ID",
      description: "The ID of the folder to list files from",
    },
  },
  async run({ $ }) {
    const files = [];
    let pageToken;

    do {
      const resp = await axios($, {
        url: "https://www.googleapis.com/drive/v3/files",
        headers: {
          Authorization: `Bearer ${this.google_drive.$auth.oauth_access_token}`,
        },
        params: {
          q: `'${this.folderId}' in parents and trashed = false`,
          driveId: this.drive,
          corpora: "drive",
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          fields: "nextPageToken,files(id,name,mimeType,webViewLink)",
          pageSize: 100,
          ...(pageToken && { pageToken }),
        },
      });

      files.push(...(resp.files || []));
      pageToken = resp.nextPageToken;
    } while (pageToken);

    $.export("$summary", `Found ${files.length} files`);
    return files;
  },
});
