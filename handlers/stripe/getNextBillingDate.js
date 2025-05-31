const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  customerId: z.string().min(1, { message: "Customer ID cannot be empty." })
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "API token cannot be empty." })
});

// Internal function to simulate a call to the Stripe API
async function _mockStripeApi_getNextBillingDate({ customerId, apiKey }) {
  console.log(`_mockStripeApi_getNextBillingDate: Simulating Stripe API call for customerId: ${customerId}`);
  console.log(`_mockStripeApi_getNextBillingDate: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  if (customerId === "cus_mock_12345") {
    // Simulate a customer with an active subscription
    const nextBillingTimestamp = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // Approx. 30 days from now
    return {
      customer: customerId,
      current_period_end: nextBillingTimestamp,
      status: "active",
      plan: {
        id: "plan_mock_monthly",
        nickname: "Monthly Subscription",
        amount: 2000, // in cents
        currency: "usd"
      }
    };
  } else if (customerId === "cus_mock_nosub") {
    // Simulate a customer with no active subscription
    return null;
  } else {
    return "mock_api_error_unsupported_customer_id";
  }
}

async function handleGetNextBillingDate({ args, auth }) {
  console.log('Executing MCP: stripe.getNextBillingDate');

  // Validate args
  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: stripe.getNextBillingDate - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
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
    console.warn('MCP: stripe.getNextBillingDate - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
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
    const subscriptionData = await _mockStripeApi_getNextBillingDate({ customerId, apiKey });

    if (subscriptionData === "mock_api_error_unsupported_customer_id") {
      return {
        success: false,
        message: "Unable to process this customer ID with the current mock Stripe API setup.",
        data: null,
      };
    } else if (subscriptionData) {
      // Extracting the relevant information for the response
      const responseData = {
        customerId: subscriptionData.customer,
        nextBillingDate: new Date(subscriptionData.current_period_end * 1000).toISOString(),
        planName: subscriptionData.plan.nickname,
        status: subscriptionData.status
      };
      return {
        success: true,
        data: responseData,
        message: "Next billing date retrieved successfully."
      };
    } else { // subscriptionData is null
      return {
        success: true,
        data: null,
        message: "No active subscription found for this customer."
      };
    }
  } catch (error) {
    console.error("Error calling _mockStripeApi_getNextBillingDate:", error);
    return {
      success: false,
      message: "An unexpected error occurred while trying to retrieve the next billing date.",
      data: null,
    };
  }
}

module.exports = handleGetNextBillingDate;
