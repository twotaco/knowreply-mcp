const { z } = require('zod');
const axios = require('axios');

// Zod Schema for arguments
const ArgsSchema = z.object({
  email: z.string().email({ message: "Invalid email format." })
});

// Zod Schema for authentication object
const AuthSchema = z.object({
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
        // Stripe typically uses 'application/x-www-form-urlencoded' for POST bodies,
        // but for GET requests with query parameters, Content-Type is not usually required.
        // However, some libraries or gateways might expect it.
        // For axios GET, it's often omitted unless specifically needed.
      }
    });

    if (response.data && response.data.data && response.data.data.length > 0) {
      const customer = response.data.data[0];
      return { // Return the relevant customer data
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        created: customer.created, // Unix timestamp
        currency: customer.currency,
        livemode: customer.livemode,
        metadata: customer.metadata,
        // Add other fields as necessary
      };
    } else {
      return null; // No customer found
    }
  } catch (error) {
    console.error("Error calling Stripe API (getCustomerByEmail):", error.message);
    let errorMessage = "An unexpected error occurred while trying to retrieve customer data from Stripe.";
    if (error.response) {
      errorMessage = `Stripe API Error: ${error.response.data?.error?.message || error.response.statusText || 'Failed to retrieve data'}`;
    } else if (error.request) {
      errorMessage = "No response received from Stripe API. Check network connectivity.";
    }
    // If error.message is more specific and error.response/error.request didn't yield a better one, use it.
    // This path is taken if it's a non-HTTP error or a setup issue with axios.
    else if (error.message && !error.response && !error.request) {
        errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
}

// Main handler function called by server.js
async function handler({ args, auth }) {
  const parsedArgs = ArgsSchema.parse(args); // Will throw ZodError if validation fails
  const parsedAuth = AuthSchema.parse(auth); // Will throw ZodError if validation fails

  return getCustomerByEmailInternal({
    email: parsedArgs.email,
    apiKey: parsedAuth.token
  });
}

module.exports = {
  handler,
  ArgsSchema,
  AuthSchema, // Exporting AuthSchema for potential use in discovery/documentation
  meta: {
    description: "Fetches a customer from Stripe by their email address. Returns the first customer if multiple exist with the same email.",
    parameters: ArgsSchema.shape, // For documenting 'args'
    auth: ['token'], // Indicates 'token' is expected in the 'auth' object
    authRequirements: "Requires a Stripe Secret Key as 'token' in the auth object.",
  }
};
