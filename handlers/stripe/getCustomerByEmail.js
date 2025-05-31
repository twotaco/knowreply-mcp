const z = require('zod');
const axios = require('axios'); // Import axios

// Zod Schemas for validation (remain the same)
const ArgsSchema = z.object({
  email: z.string().email({ message: "Invalid email format." })
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "Stripe API key (secret key) cannot be empty." })
});

// The _mockStripeApi_getCustomer function is removed or commented out.

async function handleGetCustomerByEmail({ args, auth }) {
  console.log('Executing MCP: stripe.getCustomerByEmail (Live API)');
  
  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: stripe.getCustomerByEmail - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid arguments.",
      errors: parsedArgs.error.flatten().fieldErrors,
      data: null
    };
  }

  const parsedAuth = AuthSchema.safeParse(auth);
  if (!parsedAuth.success) {
    console.warn('MCP: stripe.getCustomerByEmail - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid auth information (Stripe API key).",
      errors: parsedAuth.error.flatten().fieldErrors,
      data: null
    };
  }

  const { email } = parsedArgs.data;
  const { token: apiKey } = parsedAuth.data; // This is the Stripe Secret Key

  try {
    console.log(`Calling Stripe API to get customer by email: ${email}`);
    const response = await axios.get('https://api.stripe.com/v1/customers', {
      params: {
        email: email,
        limit: 1 // We only expect one customer or none
      },
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded' // Standard for Stripe GET params, though often not strictly needed for GET
      }
    });

    if (response.data && response.data.data && response.data.data.length > 0) {
      const customer = response.data.data[0];
      // Transform Stripe customer object to our desired MCP data structure
      const customerData = {
        id: customer.id,
        name: customer.name || null, // Stripe 'name' can be null
        email: customer.email,
        created: customer.created ? new Date(customer.created * 1000).toISOString() : null, // Stripe 'created' is a Unix timestamp
        // Add other fields as needed from the Stripe customer object based on original mock or requirements
        // For example: phone: customer.phone, currency: customer.currency, etc.
      };
      return {
        success: true,
        data: customerData,
        message: "Customer found."
      };
    } else {
      return {
        success: true, // Successfully queried API, but no customer found
        data: null,
        message: "Customer not found with the provided email."
      };
    }
  } catch (error) {
    console.error("Error calling Stripe API (getCustomerByEmail):", error.message);
    let errorMessage = "An unexpected error occurred while trying to retrieve customer data from Stripe.";
    let errorDetails = null;

    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Stripe API Error Status:', error.response.status);
      console.error('Stripe API Error Data:', error.response.data);
      errorMessage = `Stripe API Error: ${error.response.data?.error?.message || error.response.statusText || 'Failed to retrieve data'}`;
      errorDetails = {
        status: error.response.status,
        data: error.response.data?.error // Store the Stripe error object if available
      };
    } else if (error.request) {
      // The request was made but no response was received
      errorMessage = "No response received from Stripe API. Check network connectivity.";
    }
    // else: Something happened in setting up the request that triggered an Error (handled by generic message)

    return {
      success: false,
      message: errorMessage,
      data: null,
      errors: errorDetails // Provide more specific error details if available
    };
  }
}

module.exports = {
  handler: handleGetCustomerByEmail,
  ArgsSchema: ArgsSchema,
  AuthSchema: AuthSchema
};
