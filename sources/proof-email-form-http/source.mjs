// HTTP trigger source for the Proof Email Form workflow.
//
// Declared with customResponse: true so an attached workflow's final $.respond()
// step can send the HTML body back to the browser. (The workflow's built-in
// HTTP trigger has custom_response as a write-once UI flag — using a deployed
// component source instead lets us declare it in code and attach via repo sync.)

export default {
  name: "Proof_email_form_http",
  version: "0.0.1",
  key: "proof_email_form_http",
  description: "HTTP trigger for the Proof Email Form workflow. customResponse:true lets the workflow's final $.respond() step return HTML to the browser.",
  type: "source",
  props: {
    http: {
      type: "$.interface.http",
      customResponse: true,
    },
  },
  methods: {},
  async run(event) {
    this.$emit({ event });
  },
};
