import { axios } from "@pipedream/platform";
import google_drive from "@pipedream/google_drive";

export default defineComponent({
  name: "Upload Multiple Screenshots to Google Drive",
  description: "Downloads screenshot images and uploads them to Google Drive in a YYYY-MM-DD/campaign-name folder structure",
  type: "action",
  props: {
    google_drive,
    sharedDrive: {
      propDefinition: [google_drive, "sharedDrive"],
    },
    screenshots: {
      type: "any",
      label: "Screenshots",
      description: "Array of objects containing 'client' and 'url' properties",
    },
    nextSendTime: {
      type: "string",
      label: "Next Send Time",
      description: "The scheduled send time for the message (ISO format)",
    },
    messageName: {
      type: "string",
      label: "Message Name",
      description: "The name of the message to include in the folder name",
    },
  },
  methods: {
    async getOrCreateDateFolder(dateString) {
      const dateFolder = await this.google_drive.findFolder({
        name: dateString,
        parentId: this.sharedDrive,
        excludeTrashed: true,
        drive: this.sharedDrive,
        includeItemsFromAllDrives: true,
      });
      if (dateFolder && dateFolder.length > 0) return dateFolder[0];
      return await this.google_drive.createFolder({
        name: dateString,
        parentId: this.sharedDrive || undefined,
      });
    },
    async getOrCreateCampaignFolder(dateFolderId, campaignName) {
      const campaignFolder = await this.google_drive.findFolder({
        name: campaignName,
        parentId: dateFolderId,
        excludeTrashed: true,
        drive: this.sharedDrive,
        includeItemsFromAllDrives: true,
      });
      if (campaignFolder && campaignFolder.length > 0) return campaignFolder[0];
      return await this.google_drive.createFolder({
        name: campaignName,
        parentId: dateFolderId,
      });
    },
    getTodaysDate() {
      const today = new Date();
      return [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, "0"),
        String(today.getDate()).padStart(2, "0"),
      ].join("-");
    },
  },
  async run({ $ }) {
    if (!this.screenshots || this.screenshots.length === 0) {
      throw new Error("No screenshot URLs provided");
    }

    const driveBase = "https://www.googleapis.com/drive/v3";
    const uploadBase = "https://www.googleapis.com/upload/drive/v3";
    const auth = `Bearer ${this.google_drive.$auth.oauth_access_token}`;
    const supportsAllDrives = this.sharedDrive ? "&supportsAllDrives=true" : "";

    const todaysDate = this.getTodaysDate();
    const dateFolder = await this.getOrCreateDateFolder(todaysDate);
    const campaignFolder = await this.getOrCreateCampaignFolder(dateFolder.id, this.messageName);

    const uploadedFiles = [];
    const errors = [];

    for (const shot of this.screenshots) {
      const { client, url: screenshotUrl, name: displayName } = shot;
      if (!client || !screenshotUrl) {
        errors.push({ client, error: "Missing client or url" });
        continue;
      }

      try {
        const imgData = await axios($, { url: screenshotUrl, responseType: "arraybuffer" });

        const cleanUrl = screenshotUrl.split("?")[0];
        const ext = cleanUrl.split(".").pop() || "png";
        const mimeType = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" }[ext.toLowerCase()] || "image/png";
        const fileName = `${displayName || client}.${ext}`;

        const boundary = "proof_boundary";
        const body = Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
            JSON.stringify({ name: fileName, parents: [campaignFolder.id] }) +
            `\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
          ),
          Buffer.from(imgData),
          Buffer.from(`\r\n--${boundary}--`),
        ]);
        const uploaded = await axios($, {
          method: "POST",
          url: `${uploadBase}/files?uploadType=multipart${supportsAllDrives}`,
          headers: {
            Authorization: auth,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          data: body,
        });

        try {
          await axios($, {
            method: "POST",
            url: `${driveBase}/files/${uploaded.id}/permissions?${supportsAllDrives}`,
            headers: { Authorization: auth, "Content-Type": "application/json" },
            data: { type: "anyone", role: "reader" },
          });
        } catch (permErr) {
          console.warn(`Could not set public permission for ${fileName}:`, permErr.message);
        }

        uploadedFiles.push({
          id: uploaded.id,
          name: fileName,
          client,
          originalUrl: screenshotUrl,
          folderPath: `${todaysDate}/${this.messageName}`,
        });
      } catch (error) {
        console.error(`Failed to upload screenshot for client ${client}:`, error);
        errors.push({ client, url: screenshotUrl, error: error.message });
      }
    }

    $.export("$summary", `Uploaded ${uploadedFiles.length} of ${this.screenshots.length} screenshots to Drive`);
    return {
      uploadedFiles,
      errors,
      totalAttempted: this.screenshots.length,
      totalSuccessful: uploadedFiles.length,
      totalFailed: errors.length,
      messageName: this.messageName,
      folderPath: `${todaysDate}/${this.messageName}`,
      dateFolder: { id: dateFolder.id, name: dateFolder.name },
      campaignFolder: { id: campaignFolder.id, name: campaignFolder.name },
    };
  },
});
