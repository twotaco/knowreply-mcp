const { z } = require('zod');
const axios = require('axios');

// Zod Schema for arguments
const ArgsSchema = z.object({
  invoiceId: z.string().min(1, { message: "Stripe Invoice ID is required." })
});

// Zod Schema for Stripe connection/authentication object
const ConnectionSchema = z.object({
  token: z.string().min(1, { message: "Stripe API key (secret key) is required." })
});

async function sendInvoiceInternal({ invoiceId, apiKey }) {
  try {
    const response = await axios.post(`https://api.stripe.com/v1/invoices/${invoiceId}/send`,
      null,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error(`Error calling Stripe API (sendInvoice for ${invoiceId}):`, error.message);
    let errorMessage = `An unexpected error occurred while trying to send invoice ${invoiceId} from Stripe.`;
    if (error.response) {
      if (error.response.data && error.response.data.error && error.response.data.error.message) {
        errorMessage = `Stripe API Error: ${error.response.data.error.message}`;
        if (error.response.data.error.code === 'invoice_payment_action_not_supported') {
             errorMessage = `Could not send invoice ${invoiceId}: ${error.response.data.error.message}`;
        }
      } else if (error.response.statusText) {
        errorMessage = `Stripe API Error: ${error.response.statusText}`;
      } else {
        errorMessage = `Stripe API Error: Status code ${error.response.status}`;
      }
      if (error.response.status === 404) {
        errorMessage = `Stripe Invoice with ID '${invoiceId}' not found.`;
      }
    } else if (error.request) {
      errorMessage = `No response received from Stripe API when trying to send invoice ${invoiceId}. Check network connectivity.`;
    } else if (error.message) {
        errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
}

// Main handler function called by server.js
async function handler({ args, auth }) {
  const parsedArgs = ArgsSchema.parse(args);
  const parsedAuth = ConnectionSchema.parse(auth); // Use ConnectionSchema here

  return sendInvoiceInternal({
    invoiceId: parsedArgs.invoiceId,
    apiKey: parsedAuth.token,
  });
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema, // Export ConnectionSchema instead of AuthSchema
  meta: {
    description: "Sends (or re-sends) an invoice to the customer. The invoice must have an email address and be in a state where it can be sent.",
    parameters: ArgsSchema.shape,
    auth: ['token'],
    authRequirements: "Requires a Stripe Secret Key as 'token' in the auth object.",
  }
};
