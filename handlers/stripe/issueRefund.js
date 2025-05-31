const z = require('zod');
const axios = require('axios'); // Import axios
const qs = require('qs'); // Import qs for form data encoding

// Zod Schemas for validation (remain the same)
const ArgsSchema = z.object({
  chargeId: z.string().min(1, { message: "Charge ID cannot be empty." }),
  amount: z.number().positive({ message: "Amount must be a positive number." }).int({ message: "Amount must be an integer (cents)."}).optional() // Amount in cents, optional for full refund
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "Stripe API key (secret key) cannot be empty." })
});

// The _mockStripeApi_issueRefund function is removed or commented out.

async function handleIssueRefund({ args, auth }) {
  console.log('Executing MCP: stripe.issueRefund (Live API)');

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

  const parsedAuth = AuthSchema.safeParse(auth);
  if (!parsedAuth.success) {
    console.warn('MCP: stripe.issueRefund - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid auth information (Stripe API key).",
      errors: parsedAuth.error.flatten().fieldErrors,
      data: null
    };
  }

  const { chargeId, amount } = parsedArgs.data; // amount is optional (integer in cents)
  const { token: apiKey } = parsedAuth.data; // Stripe Secret Key

  try {
    console.log(`Calling Stripe API to issue refund for charge: ${chargeId}${amount ? ` with amount: ${amount}` : ' (full refund)'}`);

    const requestBody = {
      charge: chargeId,
    };
    if (amount) {
      requestBody.amount = amount;
    }

    // Stripe expects form-urlencoded data for POST requests
    const encodedRequestBody = qs.stringify(requestBody);

    const response = await axios.post('https://api.stripe.com/v1/refunds', encodedRequestBody, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (response.data && response.data.id) {
      const refund = response.data;
      // Transform Stripe refund object to our desired MCP data structure
      const refundData = {
        id: refund.id,
        amount: refund.amount, // Amount refunded, in cents
        charge: refund.charge,
        currency: refund.currency,
        status: refund.status, // e.g., 'succeeded', 'pending', 'failed', 'canceled'
        reason: refund.reason,
        created: refund.created ? new Date(refund.created * 1000).toISOString() : null, // Unix timestamp
        // Add other fields as needed
      };
      return {
        success: true,
        data: refundData,
        message: `Refund ${refund.status}.` // More dynamic message
      };
    } else {
      // This case might not be typical for Stripe if an error doesn't throw an HTTP error code
      return {
        success: false,
        message: "Stripe API call for refund did not return expected data.",
        data: null
      };
    }
  } catch (error) {
    console.error("Error calling Stripe API (issueRefund):", error.message);
    let errorMessage = "An unexpected error occurred while trying to issue the refund via Stripe.";
    let errorDetails = null;

    if (error.response) {
      console.error('Stripe API Error Status:', error.response.status);
      console.error('Stripe API Error Data:', error.response.data);
      errorMessage = `Stripe API Error: ${error.response.data?.error?.message || error.response.statusText || 'Failed to process refund'}`;
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
  handler: handleIssueRefund,
  ArgsSchema: ArgsSchema,
  AuthSchema: AuthSchema
};
