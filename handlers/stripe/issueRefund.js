const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  chargeId: z.string().min(1, { message: "Charge ID cannot be empty." }),
  amount: z.number().positive({ message: "Amount must be a positive number." }).optional() // Amount is optional for full refunds
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "API token cannot be empty." })
});

// Internal function to simulate a call to the Stripe API
async function _mockStripeApi_issueRefund({ chargeId, amount, apiKey }) {
  console.log(`_mockStripeApi_issueRefund: Simulating Stripe API call for chargeId: ${chargeId}`);
  console.log(`_mockStripeApi_issueRefund: Amount: ${amount || 'Full refund'}`);
  console.log(`_mockStripeApi_issueRefund: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  if (chargeId === "ch_mock_valid_charge") {
    return { // Simulates a successful refund object from Stripe
      id: "re_mock_abcdef12345",
      amount: amount || 5000, // Mock original charge amount if not specified
      charge: chargeId,
      currency: "usd",
      status: "succeeded",
      reason: null,
      created: Math.floor(Date.now() / 1000)
    };
  } else if (chargeId === "ch_mock_invalid_charge") {
    return "mock_api_error_charge_not_refundable";
  } else {
    return "mock_api_error_unsupported_charge_id";
  }
}

async function handleIssueRefund({ args, auth }) {
  console.log('Executing MCP: stripe.issueRefund');

  // Validate args
  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: stripe.issueRefund - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
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
    console.warn('MCP: stripe.issueRefund - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid auth information.",
      errors: parsedAuth.error.flatten().fieldErrors,
      data: null
    };
  }

  // Use validated data
  const { chargeId, amount } = parsedArgs.data; // amount can be undefined
  const { token: apiKey } = parsedAuth.data;

  console.log('Received auth token (simulated use for Stripe API key):', apiKey ? apiKey.substring(0,5) + '...' : 'No API key provided');

  try {
    const refundData = await _mockStripeApi_issueRefund({ chargeId, amount, apiKey });

    if (refundData === "mock_api_error_charge_not_refundable") {
      return {
        success: false,
        message: "This charge is not refundable (simulated).",
        data: null,
      };
    } else if (refundData === "mock_api_error_unsupported_charge_id") {
      return {
        success: false,
        message: "Unable to process this charge ID with the current mock Stripe API setup.",
        data: null,
      };
    } else if (refundData && refundData.status === 'succeeded') {
      return {
        success: true,
        data: refundData,
        message: "Refund issued successfully."
      };
    } else {
      // Should not happen with current mock but good for robustness
      return {
        success: false,
        message: "Refund attempt failed or returned an unexpected status.",
        data: refundData
      };
    }
  } catch (error) {
    console.error("Error calling _mockStripeApi_issueRefund:", error);
    return {
      success: false,
      message: "An unexpected error occurred while trying to issue the refund.",
      data: null,
    };
  }
}

module.exports = handleIssueRefund;
