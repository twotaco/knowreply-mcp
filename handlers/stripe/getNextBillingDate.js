const z = require('zod');
const axios = require('axios'); // Import axios

// Zod Schemas for validation (remain the same)
const ArgsSchema = z.object({
  customerId: z.string().min(1, { message: "Customer ID cannot be empty." })
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "Stripe API key (secret key) cannot be empty." })
});

// The _mockStripeApi_getNextBillingDate function is removed or commented out.

async function handleGetNextBillingDate({ args, auth }) {
  console.log('Executing MCP: stripe.getNextBillingDate (Live API)');

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

  const parsedAuth = AuthSchema.safeParse(auth);
  if (!parsedAuth.success) {
    console.warn('MCP: stripe.getNextBillingDate - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid auth information (Stripe API key).",
      errors: parsedAuth.error.flatten().fieldErrors,
      data: null
    };
  }

  const { customerId } = parsedArgs.data;
  const { token: apiKey } = parsedAuth.data; // Stripe Secret Key

  try {
    console.log(`Calling Stripe API to get active subscriptions for customer: ${customerId}`);
    // Fetch active subscriptions for the customer
    // We are interested in the 'current_period_end' for the next billing date.
    const response = await axios.get('https://api.stripe.com/v1/subscriptions', {
      params: {
        customer: customerId,
        status: 'active', // Only fetch active subscriptions
        limit: 1 // Typically a customer has one active subscription for a given product,
                 // but Stripe allows multiple. Fetching 1 is usually what's desired for "next billing date".
                 // If multiple active subscriptions exist, this will pick the most recently created one.
      },
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (response.data && response.data.data && response.data.data.length > 0) {
      const subscription = response.data.data[0];
      // Transform Stripe subscription object to our desired MCP data structure
      const subscriptionData = {
        customerId: subscription.customer,
        subscriptionId: subscription.id,
        nextBillingDate: new Date(subscription.current_period_end * 1000).toISOString(), // Unix timestamp
        planId: subscription.plan?.id,
        planName: subscription.plan?.nickname || subscription.plan?.product || subscription.items?.data[0]?.plan?.nickname || 'N/A', // Try to find a plan name
        status: subscription.status, // Should be 'active'
        trialEndDate: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        // Add other fields as needed
      };
      return {
        success: true,
        data: subscriptionData,
        message: "Next billing date retrieved successfully."
      };
    } else {
      return {
        success: true, // Successfully queried API, but no active subscription found
        data: null,
        message: "No active subscriptions found for this customer."
      };
    }
  } catch (error) {
    console.error("Error calling Stripe API (getNextBillingDate/subscriptions):", error.message);
    let errorMessage = "An unexpected error occurred while trying to retrieve subscription data from Stripe.";
    let errorDetails = null;

    if (error.response) {
      console.error('Stripe API Error Status:', error.response.status);
      console.error('Stripe API Error Data:', error.response.data);
      errorMessage = `Stripe API Error: ${error.response.data?.error?.message || error.response.statusText || 'Failed to retrieve data'}`;
      errorDetails = {
        status: error.response.status,
        data: error.response.data?.error
      };
    } else if (error.request) {
      errorMessage = "No response received from Stripe API. Check network connectivity.";
    }

    return {
      success: false,
      message: errorMessage,
      data: null,
      errors: errorDetails
    };
  }
}

module.exports = {
  handler: handleGetNextBillingDate,
  ArgsSchema: ArgsSchema,
  AuthSchema: AuthSchema
};
