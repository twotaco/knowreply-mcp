const { z } = require('zod');
const axios = require('axios');

// Zod Schema for arguments
const ArgsSchema = z.object({
  customerId: z.string().min(1, { message: "Stripe Customer ID is required." })
  // Common expansions for customer: 'subscriptions', 'sources', 'default_source', 'tax_ids'
  // expand: z.array(z.string()).optional().describe("Objects to expand in the response, e.g., ['subscriptions']"),
});

// Zod Schema for authentication object
const AuthSchema = z.object({
  token: z.string().min(1, { message: "Stripe API key (secret key) is required." })
});

async function getCustomerByIdInternal({ customerId, apiKey /*, expand*/ }) {
  const params = {};
  // if (expand && expand.length > 0) {
  //   params.expand = expand;
  // }

  try {
    const response = await axios.get(`https://api.stripe.com/v1/customers/${customerId}`, {
      params, // Add expand params here if implemented
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    });

    // Return the full customer object as Stripe returns it, or select fields if preferred
    return response.data;
  } catch (error) {
    console.error(`Error calling Stripe API (getCustomerById for ${customerId}):`, error.message);
    let errorMessage = `An unexpected error occurred while trying to retrieve customer ${customerId} from Stripe.`;
    if (error.response) {
      // Prioritize Stripe's error message if available
      if (error.response.data && error.response.data.error && error.response.data.error.message) {
        errorMessage = `Stripe API Error: ${error.response.data.error.message}`;
      } else if (error.response.statusText) { // Fallback to statusText if no specific message
        errorMessage = `Stripe API Error: ${error.response.statusText}`;
      } else {
        errorMessage = `Stripe API Error: Status code ${error.response.status}`;
      }
      // Specific message for 404
      if (error.response.status === 404) {
        errorMessage = `Stripe Customer with ID '${customerId}' not found.`;
      }
    } else if (error.request) {
      errorMessage = `No response received from Stripe API when fetching customer ${customerId}. Check network connectivity.`;
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

  return getCustomerByIdInternal({
    customerId: parsedArgs.customerId,
    apiKey: parsedAuth.token,
    // expand: parsedArgs.expand,
  });
}

module.exports = {
  handler,
  ArgsSchema,
  AuthSchema,
  meta: {
    description: "Fetches a customer object from Stripe by its ID. Can optionally expand related objects like subscriptions.",
    parameters: ArgsSchema.shape,
    auth: ['token'],
    authRequirements: "Requires a Stripe Secret Key as 'token' in the auth object.",
  }
};
