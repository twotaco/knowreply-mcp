const { z } = require('zod');
const axios = require('axios');

// Zod Schema for arguments
const ArgsSchema = z.object({
  customerId: z.string().min(1, { message: "Customer ID cannot be empty." })
});

// Zod Schema for connection object (renamed from AuthSchema)
const ConnectionSchema = z.object({
  token: z.string().min(1, { message: "Stripe API key (secret key) is required." })
});

async function getLastInvoiceInternal({ customerId, apiKey }) {
  try {
    const response = await axios.get('https://api.stripe.com/v1/invoices', {
      params: {
        customer: customerId,
        limit: 1,
        // Stripe's default list order is descending by created date.
      },
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    });

    if (response.data && response.data.data && response.data.data.length > 0) {
      const invoice = response.data.data[0];
      return {
        id: invoice.id,
        customer: invoice.customer,
        amount_due: invoice.amount_due,
        amount_paid: invoice.amount_paid,
        amount_remaining: invoice.amount_remaining,
        currency: invoice.currency,
        status: invoice.status,
        due_date: invoice.due_date,
        created: invoice.created,
        invoice_pdf: invoice.invoice_pdf,
        hosted_invoice_url: invoice.hosted_invoice_url,
        lines: invoice.lines.data.map(line => ({
            id: line.id,
            description: line.description,
            amount: line.amount,
            currency: line.currency,
            quantity: line.quantity,
            period: line.period
        }))
      };
    } else {
      return null; // No invoice found
    }
  } catch (error) {
    console.error(`Error calling Stripe API (getLastInvoice for customer ${customerId}):`, error.message);
    let errorMessage = `An unexpected error occurred while trying to retrieve the last invoice for customer ${customerId} from Stripe.`;
    if (error.response) {
      if (error.response.data && error.response.data.error && error.response.data.error.message) {
        errorMessage = `Stripe API Error: ${error.response.data.error.message}`;
      } else if (error.response.statusText) {
        errorMessage = `Stripe API Error: ${error.response.statusText}`;
      } else {
        errorMessage = `Stripe API Error: Status code ${error.response.status}`;
      }
      // For a list endpoint, a 404 might mean the customer doesn't exist or has no invoices,
      // but often it just returns an empty list. Explicit 404 handling might be less common here
      // than for direct ID lookups unless Stripe specifically documents it for this case.
      // The current logic of returning null for empty data array covers "no invoices found".
    } else if (error.request) {
      errorMessage = `No response received from Stripe API when fetching last invoice for customer ${customerId}. Check network connectivity.`;
    } else if (error.message) {
        errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
}

// Main handler function called by server.js
async function handler({ args, auth }) {
  const parsedArgs = ArgsSchema.parse(args);
  const parsedAuth = ConnectionSchema.parse(auth); // Use ConnectionSchema

  return getLastInvoiceInternal({
    customerId: parsedArgs.customerId,
    apiKey: parsedAuth.token
  });
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema,
  meta: {
    description: "Fetches the most recent invoice for a given Stripe customer ID.",
    parameters: ArgsSchema.shape,
    auth: ['token'],
    authRequirements: "Requires a Stripe Secret Key as 'token' in the auth object.",
  }
};
