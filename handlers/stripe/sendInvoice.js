const { z } = require('zod');
const axios = require('axios');

// Zod Schema for arguments
const ArgsSchema = z.object({
  invoiceId: z.string().min(1, { message: "Stripe Invoice ID is required." })
});

// Zod Schema for authentication object
const AuthSchema = z.object({
  token: z.string().min(1, { message: "Stripe API key (secret key) is required." })
});

async function sendInvoiceInternal({ invoiceId, apiKey }) {
  try {
    // The send invoice endpoint is a POST request, but it doesn't typically require a body.
    // The action is identified by the URL itself.
    const response = await axios.post(`https://api.stripe.com/v1/invoices/${invoiceId}/send`, 
      null, // No request body needed for this Stripe POST endpoint
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          // 'Content-Type': 'application/x-www-form-urlencoded' // Often Stripe's default for POSTs
                                                              // but might not be strictly needed if no body.
        }
      }
    );
    return response.data; // Returns the updated invoice object
  } catch (error) {
    console.error(`Error calling Stripe API (sendInvoice for ${invoiceId}):`, error.message);
    let errorMessage = `An unexpected error occurred while trying to send invoice ${invoiceId} from Stripe.`;
    if (error.response) {
      // Prioritize Stripe's error message if available
      if (error.response.data && error.response.data.error && error.response.data.error.message) {
        errorMessage = `Stripe API Error: ${error.response.data.error.message}`;
         // Specific error if invoice cannot be sent (e.g., already paid, draft, void)
        if (error.response.data.error.code === 'invoice_payment_action_not_supported') {
             errorMessage = `Could not send invoice ${invoiceId}: ${error.response.data.error.message}`;
        }
      } else if (error.response.statusText) { // Fallback to statusText if no specific message
        errorMessage = `Stripe API Error: ${error.response.statusText}`;
      } else {
        errorMessage = `Stripe API Error: Status code ${error.response.status}`;
      }
       // Specific message for 404 (overrides more general messages if status is 404)
      if (error.response.status === 404) {
        errorMessage = `Stripe Invoice with ID '${invoiceId}' not found.`;
      }
    } else if (error.request) {
      errorMessage = `No response received from Stripe API when trying to send invoice ${invoiceId}. Check network connectivity.`;
    } else if (error.message) { // Non-HTTP errors or setup issues with axios
        errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
}

// Main handler function called by server.js
async function handler({ args, auth }) {
  const parsedArgs = ArgsSchema.parse(args);
  const parsedAuth = AuthSchema.parse(auth);

  return sendInvoiceInternal({
    invoiceId: parsedArgs.invoiceId,
    apiKey: parsedAuth.token,
  });
}

module.exports = {
  handler,
  ArgsSchema,
  AuthSchema,
  meta: {
    description: "Sends (or re-sends) an invoice to the customer. The invoice must have an email address and be in a state where it can be sent.",
    parameters: ArgsSchema.shape,
    auth: ['token'],
    authRequirements: "Requires a Stripe Secret Key as 'token' in the auth object.",
  }
};
