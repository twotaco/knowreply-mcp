const { z } = require('zod');
const axios = require('axios');

// Zod Schema for arguments
const ArgsSchema = z.object({
  email: z.string().email({ message: "Invalid email format." })
});

// Zod Schema for Stripe connection/authentication object
const ConnectionSchema = z.object({
  token: z.string().min(1, { message: "Stripe API key (secret key) is required." })
});

async function getCustomerByEmailInternal({ email, apiKey }) {
  try {
    const response = await axios.get('https://api.stripe.com/v1/customers', {
      params: {
        email: email,
        limit: 1 // We expect one customer or none
      },
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    });

    if (response.data && response.data.data && response.data.data.length > 0) {
      const customer = response.data.data[0];
      return {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        created: customer.created,
        currency: customer.currency,
        livemode: customer.livemode,
        metadata: customer.metadata,
      };
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error calling Stripe API (getCustomerByEmail):", error.message);
    let errorMessage = "An unexpected error occurred while trying to retrieve customer data from Stripe.";
    if (error.response) {
      errorMessage = `Stripe API Error: ${error.response.data?.error?.message || error.response.statusText || 'Failed to retrieve data'}`;
    } else if (error.request) {
      errorMessage = "No response received from Stripe API. Check network connectivity.";
    } else if (error.message && !error.response && !error.request) {
        errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
}

// Main handler function called by server.js
async function handler({ args, auth }) {
  const parsedArgs = ArgsSchema.parse(args);
  const parsedAuth = ConnectionSchema.parse(auth); // Use ConnectionSchema here

  return getCustomerByEmailInternal({
    email: parsedArgs.email,
    apiKey: parsedAuth.token
  });
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema, // Export ConnectionSchema instead of AuthSchema
  meta: {
    description: "Fetches a customer from Stripe by their email address. Returns the first customer if multiple exist with the same email.",
    parameters: ArgsSchema.shape,
    auth: ['token'],
    authRequirements: "Requires a Stripe Secret Key as 'token' in the auth object.",
  }
};
