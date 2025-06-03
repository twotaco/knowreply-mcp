const { z } = require('zod');
const axios = require('axios');

// Zod Schema for arguments
const ArgsSchema = z.object({
  customerId: z.string().optional().describe("ID of the customer whose invoices to retrieve."),
  subscriptionId: z.string().optional().describe("ID of the subscription whose invoices to retrieve."),
  status: z.enum(['draft', 'open', 'paid', 'uncollectible', 'void']).optional().describe("The status of the invoices to retrieve."),
  limit: z.number().int().positive().max(100).optional().describe("A limit on the number of objects to be returned, between 1 and 100."),
  starting_after: z.string().optional().describe("A cursor for use in pagination."),
  ending_before: z.string().optional().describe("A cursor for use in pagination."),
});

// Zod Schema for Stripe connection/authentication object
const ConnectionSchema = z.object({
  token: z.string().min(1, { message: "Stripe API key (secret key) is required." })
});

async function getInvoicesInternal({ apiKey, customerId, subscriptionId, status, limit, starting_after, ending_before }) {
  const params = {};
  if (customerId) params.customer = customerId;
  if (subscriptionId) params.subscription = subscriptionId;
  if (status) params.status = status;
  if (limit) params.limit = limit;
  if (starting_after) params.starting_after = starting_after;
  if (ending_before) params.ending_before = ending_before;

  try {
    const response = await axios.get('https://api.stripe.com/v1/invoices', {
      params,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    });
    return response.data;
  } catch (error) {
    console.error(`Error calling Stripe API (getInvoices):`, error.message);
    let errorMessage = 'An unexpected error occurred while trying to retrieve invoices from Stripe.';
    if (error.response) {
      if (error.response.data && error.response.data.error && error.response.data.error.message) {
        errorMessage = `Stripe API Error: ${error.response.data.error.message}`;
      } else if (error.response.statusText) {
        errorMessage = `Stripe API Error: ${error.response.statusText}`;
      } else {
        errorMessage = `Stripe API Error: Status code ${error.response.status}`;
      }
    } else if (error.request) {
      errorMessage = 'No response received from Stripe API when fetching invoices. Check network connectivity.';
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

  return getInvoicesInternal({
    apiKey: parsedAuth.token,
    customerId: parsedArgs.customerId,
    subscriptionId: parsedArgs.subscriptionId,
    status: parsedArgs.status,
    limit: parsedArgs.limit,
    starting_after: parsedArgs.starting_after,
    ending_before: parsedArgs.ending_before,
  });
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema, // Export ConnectionSchema instead of AuthSchema
  meta: {
    description: "Fetches a list of invoices from Stripe. Supports filtering by customer ID, subscription ID, status, and pagination.",
    parameters: ArgsSchema.shape,
    auth: ['token'],
    authRequirements: "Requires a Stripe Secret Key as 'token' in the auth object.",
  }
};
