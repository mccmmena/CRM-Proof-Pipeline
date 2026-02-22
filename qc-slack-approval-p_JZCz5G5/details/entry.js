export default defineComponent({
  async run({ steps, $ }) {
    const [date] = steps.trigger.context.ts.split('T');
    
    const nameRegex = /\*(.*?)\*/; 
    const communication = steps.trigger.event.text.match(nameRegex);
    return {
      date,
      communication: communication[1]
    }
  },
})