const { z } = require('zod');
const axios = require('axios');
const qs = require('qs'); // For 'application/x-www-form-urlencoded'

// Zod Schema for arguments
const ArgsSchema = z.object({
  chargeId: z.string().min(1, { message: "Charge ID cannot be empty." }),
  amount: z.number().positive({ message: "Amount must be a positive number." })
           .int({ message: "Amount must be an integer (cents)."}).optional()
           .describe("Amount in cents to refund. If not provided, a full refund is attempted."),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional()
            .describe("Reason for the refund."),
  // Other potential refund params: metadata, reverse_transfer, refund_application_fee
});

// Zod Schema for connection object
const ConnectionSchema = z.object({
  token: z.string().min(1, { message: "Stripe API key (secret key) is required." })
});

async function issueRefundInternal({ chargeId, apiKey, amount, reason }) {
  const requestBody = {
    charge: chargeId,
  };
  if (amount) {
    requestBody.amount = amount;
  }
  if (reason) {
    requestBody.reason = reason;
  }

  const encodedRequestBody = qs.stringify(requestBody);

  try {
    const response = await axios.post('https://api.stripe.com/v1/refunds', encodedRequestBody, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const refund = response.data;
    return {
      id: refund.id,
      amount: refund.amount,
      charge: refund.charge,
      currency: refund.currency,
      status: refund.status,
      reason: refund.reason,
      created: new Date(refund.created * 1000).toISOString(),
      // metadata: refund.metadata
    };
  } catch (error) {
    console.error(`Error calling Stripe API (issueRefund for charge ${chargeId}):`, error.message);
    let errorMessage = `An unexpected error occurred while trying to issue refund for charge ${chargeId} via Stripe.`;
    if (error.response) {
      if (error.response.data && error.response.data.error && error.response.data.error.message) {
        errorMessage = `Stripe API Error: ${error.response.data.error.message}`;
      } else if (error.response.statusText) {
        errorMessage = `Stripe API Error: ${error.response.statusText}`;
      } else {
        errorMessage = `Stripe API Error: Status code ${error.response.status}`;
      }
      // Example: Stripe might return a specific error code if the charge cannot be refunded
      // if (error.response.data?.error?.code === 'charge_already_refunded') {
      //   errorMessage = `Could not refund charge ${chargeId}: ${error.response.data.error.message}`;
      // }
    } else if (error.request) {
      errorMessage = `No response received from Stripe API when trying to issue refund for charge ${chargeId}. Check network connectivity.`;
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

  return issueRefundInternal({
    chargeId: parsedArgs.chargeId,
    amount: parsedArgs.amount,
    reason: parsedArgs.reason,
    apiKey: parsedAuth.token
  });
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema,
  meta: {
    description: "Issues a refund for a specific charge in Stripe. Amount is optional (full refund if omitted).",
    parameters: ArgsSchema.shape,
    auth: ['token'],
    authRequirements: "Requires a Stripe Secret Key as 'token' in the auth object.",
  }
};
