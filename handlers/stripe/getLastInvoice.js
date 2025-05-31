const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  customerId: z.string().min(1, { message: "Customer ID cannot be empty." })
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "API token cannot be empty." })
});

// Internal function to simulate a call to the Stripe API
async function _mockStripeApi_getLastInvoice({ customerId, apiKey }) {
  console.log(`_mockStripeApi_getLastInvoice: Simulating Stripe API call for customerId: ${customerId}`);
  console.log(`_mockStripeApi_getLastInvoice: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  if (customerId === "cus_mock_12345") {
    return { // Simulates a found invoice object from Stripe
      id: "in_mock_abcdef12345",
      customer: customerId,
      amount_due: 2000, // in cents
      currency: "usd",
      status: "open",
      due_date: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days from now
      lines: {
        data: [
          {
            id: "li_mock_lineitem1",
            description: "Subscription Product",
            amount: 2000,
            currency: "usd"
          }
        ]
      },
      // other stripe specific fields...
    };
  } else if (customerId === "cus_mock_noinvoice") {
    return null; // Simulates Stripe API returning null or an empty list when no invoice found
  } else {
    return "mock_api_error_unsupported_customer_id";
  }
}

async function handleGetLastInvoice({ args, auth }) {
  console.log('Executing MCP: stripe.getLastInvoice');

  // Validate args
  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: stripe.getLastInvoice - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
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
    console.warn('MCP: stripe.getLastInvoice - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid auth information.",
      errors: parsedAuth.error.flatten().fieldErrors,
      data: null
    };
  }

  // Use validated data
  const { customerId } = parsedArgs.data;
  const { token: apiKey } = parsedAuth.data;

  console.log('Received auth token (simulated use for Stripe API key):', apiKey ? apiKey.substring(0,5) + '...' : 'No API key provided');

  try {
    const invoiceData = await _mockStripeApi_getLastInvoice({ customerId, apiKey });

    if (invoiceData === "mock_api_error_unsupported_customer_id") {
      return {
        success: false,
        message: "Unable to process this customer ID with the current mock Stripe API setup.",
        data: null,
      };
    } else if (invoiceData) {
      return {
        success: true,
        data: invoiceData,
        message: "Last invoice retrieved successfully."
      };
    } else { // invoiceData is null
      return {
        success: true,
        data: null,
        message: "No invoice found for this customer."
      };
    }
  } catch (error) {
    console.error("Error calling _mockStripeApi_getLastInvoice:", error);
    return {
      success: false,
      message: "An unexpected error occurred while trying to retrieve the last invoice.",
      data: null,
    };
  }
}

module.exports = {
  handler: handleGetLastInvoice,
  ArgsSchema: ArgsSchema,
  AuthSchema: AuthSchema
};
