export default defineComponent({
  async run({ steps, $ }) {
    // 1. We grab the data from your specific step path
    const files = steps.list_files.$return_value;

    // 2. Separate files into two groups based on whether the name contains "gmail"
    const o365Files = files.filter(file => file.name.toLowerCase().includes('o365'));
    const otherFiles = files.filter(file => !file.name.toLowerCase().includes('o365'));

    // Helper function to format a list of files into Slack markup
    const formatFiles = (fileList) => {
      return fileList.map(file => {
        const url = `https://drive.google.com/uc?export=view&id=${file.id}`;
        const text = file.name;
        return `• <${url}|${text}>`;
      }).join('\n');
    };

    // 3. We return the formatted strings so the next step can use it
    return {
      preview: formatFiles(o365Files),
      other: formatFiles(otherFiles)
    };
  },
})