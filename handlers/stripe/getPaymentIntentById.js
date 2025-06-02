const { z } = require('zod');
const axios = require('axios');

// Zod Schema for arguments
const ArgsSchema = z.object({
  paymentIntentId: z.string().min(1, { message: "Stripe Payment Intent ID is required." })
  // Stripe API allows 'client_secret' as an optional param for this endpoint,
  // but it's usually for client-side confirmation, not server-side retrieval.
  // expand: z.array(z.string()).optional().describe("Objects to expand."),
});

// Zod Schema for authentication object
const AuthSchema = z.object({
  token: z.string().min(1, { message: "Stripe API key (secret key) is required." })
});

async function getPaymentIntentByIdInternal({ paymentIntentId, apiKey /*, expand*/ }) {
  const params = {};
  // if (expand && expand.length > 0) {
  //   params.expand = expand;
  // }

  try {
    const response = await axios.get(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
      params,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    });
    return response.data; // Returns the PaymentIntent object
  } catch (error) {
    console.error(`Error calling Stripe API (getPaymentIntentById for ${paymentIntentId}):`, error.message);
    let errorMessage = `An unexpected error occurred while trying to retrieve Payment Intent ${paymentIntentId} from Stripe.`;
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
        errorMessage = `Stripe Payment Intent with ID '${paymentIntentId}' not found.`;
      }
    } else if (error.request) {
      errorMessage = `No response received from Stripe API when fetching Payment Intent ${paymentIntentId}. Check network connectivity.`;
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

  return getPaymentIntentByIdInternal({
    paymentIntentId: parsedArgs.paymentIntentId,
    apiKey: parsedAuth.token,
    // expand: parsedArgs.expand,
  });
}

module.exports = {
  handler,
  ArgsSchema,
  AuthSchema,
  meta: {
    description: "Fetches a PaymentIntent object from Stripe by its ID.",
    parameters: ArgsSchema.shape,
    auth: ['token'],
    authRequirements: "Requires a Stripe Secret Key as 'token' in the auth object.",
  }
};
