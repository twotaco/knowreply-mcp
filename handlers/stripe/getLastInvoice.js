const z = require('zod');
const axios = require('axios'); // Import axios

// Zod Schemas for validation (remain the same)
const ArgsSchema = z.object({
  customerId: z.string().min(1, { message: "Customer ID cannot be empty." })
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "Stripe API key (secret key) cannot be empty." })
});

// The _mockStripeApi_getLastInvoice function is removed or commented out.

async function handleGetLastInvoice({ args, auth }) {
  console.log('Executing MCP: stripe.getLastInvoice (Live API)');

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

  const parsedAuth = AuthSchema.safeParse(auth);
  if (!parsedAuth.success) {
    console.warn('MCP: stripe.getLastInvoice - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
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
    console.log(`Calling Stripe API to get last invoice for customer: ${customerId}`);
    // Fetch invoices for the customer, order by creation date descending (Stripe default is descending by created)
    // We can also filter by status if needed, e.g., ['open', 'paid']
    // The design doc mentioned "most recent invoice with amount, status."
    const response = await axios.get('https://api.stripe.com/v1/invoices', {
      params: {
        customer: customerId,
        limit: 1, // Get only the most recent one
        // status: 'paid' // Optional: filter by status, e.g., only 'paid' or 'open' invoices
                         // Or fetch without status and return whatever is most recent.
                         // For now, let's fetch the absolute most recent regardless of status
                         // to match "most recent invoice" broadly.
      },
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (response.data && response.data.data && response.data.data.length > 0) {
      const invoice = response.data.data[0];
      // Transform Stripe invoice object to our desired MCP data structure
      // This should align with the fields previously in the mock.
      const invoiceData = {
        id: invoice.id,
        customer: invoice.customer,
        amount_due: invoice.amount_due,
        amount_paid: invoice.amount_paid,
        amount_remaining: invoice.amount_remaining,
        currency: invoice.currency,
        status: invoice.status, // e.g., 'draft', 'open', 'paid', 'uncollectible', 'void'
        due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null, // Unix timestamp
        created: invoice.created ? new Date(invoice.created * 1000).toISOString() : null, // Unix timestamp
        invoice_pdf: invoice.invoice_pdf,
        hosted_invoice_url: invoice.hosted_invoice_url,
        lines: invoice.lines.data.map(line => ({ // Simplify line items
            id: line.id,
            description: line.description,
            amount: line.amount,
            currency: line.currency,
            quantity: line.quantity,
            period: line.period
        }))
        // Add other fields as needed
      };
      return {
        success: true,
        data: invoiceData,
        message: "Last invoice retrieved successfully."
      };
    } else {
      return {
        success: true, // Successfully queried API, but no invoice found
        data: null,
        message: "No invoices found for this customer."
      };
    }
  } catch (error) {
    console.error("Error calling Stripe API (getLastInvoice):", error.message);
    let errorMessage = "An unexpected error occurred while trying to retrieve the last invoice from Stripe.";
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
  handler: handleGetLastInvoice,
  ArgsSchema: ArgsSchema,
  AuthSchema: AuthSchema
};
