import { axios } from "@pipedream/platform"
import google_drive from "@pipedream/google_drive"

export default defineComponent({
  name: "Upload Multiple Screenshots to Google Drive",
  description: "Downloads multiple screenshot images from URLs and uploads them to Google Drive in a YYYY-MM-DD/campaign-name folder structure with message-based filenames",
  type: "action",
  props: {
    google_drive,
    sharedDrive: {
      propDefinition: [google_drive, "sharedDrive"],
    },
    screenshots: {
      type: "any",
      label: "Screenshots",
      description: "Array of objects containing 'client' and 'url' properties. Example: [{\"client\": \"applemail16\", \"url\": \"https://...\"}]"
    },
    nextSendTime: {
      type: "string",
      label: "Next Send Time",
      description: "The scheduled send time for the message (ISO format)"
    },
    messageName: {
      type: "string",
      label: "Message Name",
      description: "The name of the message to include in the folder name"
    }
  },
  methods: {
    async getOrCreateDateFolder(dateString) {
      // Try to find an existing date folder in the shared drive root
      const dateFolder = await this.google_drive.findFolder({
        name: dateString,
        parentId: this.sharedDrive,
        excludeTrashed: true,
        drive: this.sharedDrive
      });

      if (dateFolder && dateFolder.length > 0) {
        return dateFolder[0];
      }

      // If no date folder exists, create one in the shared drive root
      const createOpts = {
        name: dateString
      };

      // If using a shared drive, add it to the creation options
      if (this.sharedDrive) {
        createOpts.parentId = this.sharedDrive;
      }

      return await this.google_drive.createFolder(createOpts);
    },

    async getOrCreateCampaignFolder(dateFolderId, campaignName) {
      // Try to find an existing campaign folder within the date folder
      const campaignFolder = await this.google_drive.findFolder({
        name: campaignName,
        parentId: dateFolderId,
        excludeTrashed: true,
        drive: this.sharedDrive
      });

      if (campaignFolder && campaignFolder.length > 0) {
        return campaignFolder[0];
      }

      // If no campaign folder exists, create one inside the date folder
      return await this.google_drive.createFolder({
        name: campaignName,
        parentId: dateFolderId
      });
    },

    getTodaysDate() {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  },
  async run({ $ }) {
    const uploadedFiles = []
    const errors = []

    if (!this.screenshots || this.screenshots.length === 0) {
      throw new Error("No screenshot URLs provided")
    }

    // Generate today's date in YYYY-MM-DD format
    const todaysDate = this.getTodaysDate()

    // Get or create today's date folder in the shared drive root
    const dateFolder = await this.getOrCreateDateFolder(todaysDate)
    console.log(`Using date folder: ${dateFolder.name} (${dateFolder.id})`)

    // Get or create campaign folder within the date folder
    const campaignFolder = await this.getOrCreateCampaignFolder(dateFolder.id, this.messageName)
    console.log(`Using campaign folder: ${campaignFolder.name} (${campaignFolder.id})`)

    for (let i = 0; i < this.screenshots.length; i++) {
      const { client, url: screenshotUrl, name: displayName } = this.screenshots[i]

      // Skip if missing required data
      if (!client || !screenshotUrl) {
        console.warn(`Skipping item at index ${i}: Missing client or url`)
        errors.push({
          index: i,
          error: "Missing client or url",
          item: this.screenshots[i]
        })
        continue
      }

      try {
        // Download the image from URL
        const response = await axios($, {
          url: screenshotUrl,
          method: "GET",
          responseType: "stream"
        })

        // Extract file extension from URL (ignoring query params) or default to .png
        // Handle URLs like https://.../image.png?signature=...
        const cleanUrl = screenshotUrl.split('?')[0]
        const fileNameFromUrl = cleanUrl.split('/').pop()
        const extension = fileNameFromUrl.includes('.') ? fileNameFromUrl.split('.').pop() : 'png'

        // Create filename using the friendly display name (falls back to client ID)
        const finalFileName = `${displayName || client}.${extension}`

        // Determine MIME type based on extension
        const mimeTypeMap = {
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'gif': 'image/gif',
          'webp': 'image/webp'
        }
        const mimeType = mimeTypeMap[extension.toLowerCase()] || 'image/png'

        // Upload to Google Drive in the campaign folder
        const uploadedFile = await this.google_drive.createFile({
          file: response,
          name: finalFileName,
          mimeType: mimeType,
          parentId: campaignFolder.id,
          fields: "id,name,webViewLink,size"
        })

        // Make the file publicly accessible so Slack can render it inline
        try {
          await axios($, {
            method: "POST",
            url: `https://www.googleapis.com/drive/v3/files/${uploadedFile.id}/permissions?supportsAllDrives=true`,
            headers: {
              Authorization: `Bearer ${this.google_drive.$auth.oauth_access_token}`,
              "Content-Type": "application/json",
            },
            data: { type: "anyone", role: "reader" },
          });
        } catch (permErr) {
          console.warn(`Could not set public permission for ${uploadedFile.name}:`, permErr.message);
        }

        uploadedFiles.push({
          id: uploadedFile.id,
          name: uploadedFile.name,
          webViewLink: uploadedFile.webViewLink,
          size: uploadedFile.size,
          originalUrl: screenshotUrl,
          client: client,
          folderPath: `${todaysDate}/${this.messageName}`
        })

      } catch (error) {
        console.error(`Failed to upload screenshot for client ${client}:`, error)
        errors.push({
          client: client,
          url: screenshotUrl,
          error: error.message
        })
      }
    }

    // Export summary
    $.export("$summary", `Successfully uploaded ${uploadedFiles.length} of ${this.screenshots.length} screenshots to Google Drive folder ${todaysDate}/${this.messageName}`)

    // Return results
    return {
      uploadedFiles,
      errors,
      totalAttempted: this.screenshots.length,
      totalSuccessful: uploadedFiles.length,
      totalFailed: errors.length,
      messageName: this.messageName,
      folderPath: `${todaysDate}/${this.messageName}`,
      sharedDrive: this.sharedDrive || null,
      dateFolder: {
        id: dateFolder.id,
        name: dateFolder.name
      },
      campaignFolder: {
        id: campaignFolder.id,
        name: campaignFolder.name
      }
    }
  }
})