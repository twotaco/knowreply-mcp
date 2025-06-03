const { z } = require('zod');
const axios = require('axios');

// Zod Schema for arguments
const ArgsSchema = z.object({
  customerId: z.string().min(1, { message: "Customer ID cannot be empty." })
});

// Zod Schema for connection object
const ConnectionSchema = z.object({
  token: z.string().min(1, { message: "Stripe API key (secret key) is required." })
});

// Zod Schema for the object returned by getNextBillingDateInternal when a subscription is found
const NextBillingDateObjectSchema = z.object({
  customerId: z.string(),
  subscriptionId: z.string(),
  nextBillingDate: z.string().datetime({ message: "Invalid ISO date format for nextBillingDate" }),
  planId: z.string().optional(), // plan.id might not exist if the plan is deleted or structure changes
  planName: z.string(), // Defaulted to 'N/A' if not found, so it should always be a string
  status: z.string(), // Based on the query, this should be 'active'
  trialEndDate: z.string().datetime({ message: "Invalid ISO date format for trialEndDate" }).nullable(), // Can be null
}).passthrough(); // Allow passthrough just in case, though the object is manually constructed

// The actual OutputSchema for the handler, which can be null if no active subscription is found
const OutputSchema = NextBillingDateObjectSchema.nullable();

async function getNextBillingDateInternal({ customerId, apiKey }) {
  try {
    const response = await axios.get('https://api.stripe.com/v1/subscriptions', {
      params: {
        customer: customerId,
        status: 'active',
        limit: 1
      },
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    });

    if (response.data && response.data.data && response.data.data.length > 0) {
      const subscription = response.data.data[0];
      return {
        customerId: subscription.customer,
        subscriptionId: subscription.id,
        nextBillingDate: new Date(subscription.current_period_end * 1000).toISOString(),
        planId: subscription.plan?.id,
        planName: subscription.plan?.nickname || subscription.plan?.product || subscription.items?.data[0]?.plan?.nickname || 'N/A',
        status: subscription.status,
        trialEndDate: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      };
    } else {
      return null; // No active subscription found
    }
  } catch (error) {
    console.error(`Error calling Stripe API (getNextBillingDate for customer ${customerId}):`, error.message);
    let errorMessage = `An unexpected error occurred while trying to retrieve next billing date for customer ${customerId} from Stripe.`;
    if (error.response) {
      if (error.response.data && error.response.data.error && error.response.data.error.message) {
        errorMessage = `Stripe API Error: ${error.response.data.error.message}`;
      } else if (error.response.statusText) {
        errorMessage = `Stripe API Error: ${error.response.statusText}`;
      } else {
        errorMessage = `Stripe API Error: Status code ${error.response.status}`;
      }
      // A 404 for customerId in a list subscriptions call might just return empty data,
      // but if Stripe does return 404 for this, it could be handled.
      // The current logic of returning null for empty data array covers "no active subscriptions".
    } else if (error.request) {
      errorMessage = `No response received from Stripe API when fetching next billing date for customer ${customerId}. Check network connectivity.`;
    } else if (error.message) {
        errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
}

// Main handler function called by server.js
async function handler({ args, auth }) {
  const parsedArgs = ArgsSchema.parse(args);
  const parsedAuth = ConnectionSchema.parse(auth);

  return getNextBillingDateInternal({
    customerId: parsedArgs.customerId,
    apiKey: parsedAuth.token
  });
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema,
  OutputSchema, // Export the OutputSchema
  meta: {
    description: "Fetches the next billing date for a customer by looking at their most recent active subscription.",
    parameters: ArgsSchema.shape,
    auth: ['token'],
    authRequirements: "Requires a Stripe Secret Key as 'token' in the auth object.",
  }
};
