const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  email: z.string().email({ message: "Invalid email format." })
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "API token cannot be empty." })
});

// Internal function to simulate a call to the Stripe API
async function _mockStripeApi_getCustomer({ email, apiKey }) {
  console.log(`_mockStripeApi_getCustomer: Simulating Stripe API call for email: ${email}`);
  console.log(`_mockStripeApi_getCustomer: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  if (email === "customer@example.com") {
    return { // Simulates a found customer object from Stripe
      id: "cus_mock_12345",
      name: "Test Customer",
      email: "customer@example.com",
      created: "2024-01-01T10:00:00Z",
      // other stripe specific fields...
    };
  } else if (email === "notfound@example.com") {
    return null; // Simulates Stripe API returning null or an empty list when customer not found
  } else {
    // Simulates an error or unexpected response from Stripe for other emails in this mock
    return "mock_api_error_unsupported_email";
  }
}

async function handleGetCustomerByEmail({ args, auth }) {
  console.log('Executing MCP: stripe.getCustomerByEmail');
  
  // Validate args
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

  // Validate auth
  const parsedAuth = AuthSchema.safeParse(auth);
  if (!parsedAuth.success) {
    console.warn('MCP: stripe.getCustomerByEmail - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid auth information.",
      errors: parsedAuth.error.flatten().fieldErrors,
      data: null
    };
  }

  // Use validated data
  const { email } = parsedArgs.data;
  const { token: apiKey } = parsedAuth.data;

  // Avoid logging the full token in production for security, but this is a mock.
  console.log('Received auth token (simulated use):', apiKey ? apiKey.substring(0,5) + '...' : 'No API key extracted after validation');


  try {
    const customerData = await _mockStripeApi_getCustomer({ email, apiKey });

    if (customerData === "mock_api_error_unsupported_email") {
      return {
        success: false,
        message: "Unable to process this email with the current mock Stripe API setup.",
        data: null,
      };
    } else if (customerData) {
      return {
        success: true,
        data: customerData, // The raw data from the 'API'
        message: "Customer found."
      };
    } else { // customerData is null
      return {
        success: true,
        data: null,
        message: "Customer not found."
      };
    }
  } catch (error) {
    // This would catch errors if _mockStripeApi_getCustomer threw an exception
    console.error("Error calling _mockStripeApi_getCustomer:", error);
    return {
      success: false,
      message: "An unexpected error occurred while trying to retrieve customer data.",
      data: null,
      // error: error.message // Optionally include error details
    };
  }
}

module.exports = {
  handler: handleGetCustomerByEmail,
  ArgsSchema: ArgsSchema,
  AuthSchema: AuthSchema
};
