export default defineComponent({
  async run({ steps, $ }) {
    // 1. Get the raw string from your Elvex step
    // Replace 'node' with the actual name of your Elvex step
    let rawResponse = steps.ghostwriter.$return_value.data.response;

    try {
      // 2. Clean up common AI formatting issues 
      // (Removes ```json ... ``` if the AI included them)
      const cleanedResponse = rawResponse.replace(/```json|```/g, "").trim();

      // 3. Parse the string into a JS Object
      const parsedData = JSON.parse(cleanedResponse);

      // 4. Return the data so you can use it in future steps
      return parsedData;

    } catch (error) {
      // If the AI didn't return valid JSON, this prevents the workflow from crashing
      console.error("Failed to parse AI response as JSON:", error);
      throw new Error("The AI response was not valid JSON. Check the 'Logs' tab.");
    }
  },
})