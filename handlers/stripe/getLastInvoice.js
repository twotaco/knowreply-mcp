const { z } = require('zod');
const axios = require('axios');

// Zod Schema for arguments
const ArgsSchema = z.object({
  customerId: z.string().min(1, { message: "Customer ID cannot be empty." })
});

// Zod Schema for connection object (renamed from AuthSchema)
const ConnectionSchema = z.object({
  token: z.string().min(1, { message: "Stripe API key (secret key) is required." })
});

// Zod Schema for Line Items within the Last Invoice
const LastInvoiceLineItemSchema = z.object({
  id: z.string(),
  description: z.string().nullable().optional(), // Description can be null or missing
  amount: z.number().int(),
  currency: z.string(),
  quantity: z.number().int().nullable().optional(), // Quantity can be null or missing
  period: z.object({
    start: z.number().int(),
    end: z.number().int(),
  }).optional(), // Period might not be present on all line item types
}).passthrough(); // Allow other fields that might be on the line item

// Zod Schema for the structure returned by getLastInvoiceInternal
const LastInvoiceObjectSchema = z.object({
  id: z.string(),
  customer: z.string(),
  amount_due: z.number().int(),
  amount_paid: z.number().int(),
  amount_remaining: z.number().int(),
  currency: z.string(),
  status: z.string().nullable().optional(), // Status can be various strings, or null
  due_date: z.number().int().nullable().optional(), // Unix timestamp or null
  created: z.number().int(), // Unix timestamp
  invoice_pdf: z.string().url().nullable().optional(),
  hosted_invoice_url: z.string().url().nullable().optional(),
  lines: z.array(LastInvoiceLineItemSchema),
}).passthrough(); // Allow other top-level fields from the invoice object

// The actual OutputSchema for the handler, which can be null if no invoice is found
const OutputSchema = LastInvoiceObjectSchema.nullable();

async function getLastInvoiceInternal({ customerId, apiKey }) {
  try {
    const response = await axios.get('https://api.stripe.com/v1/invoices', {
      params: {
        customer: customerId,
        limit: 1,
        // Stripe's default list order is descending by created date.
      },
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    });

    if (response.data && response.data.data && response.data.data.length > 0) {
      const invoice = response.data.data[0];
      return {
        id: invoice.id,
        customer: invoice.customer,
        amount_due: invoice.amount_due,
        amount_paid: invoice.amount_paid,
        amount_remaining: invoice.amount_remaining,
        currency: invoice.currency,
        status: invoice.status,
        due_date: invoice.due_date,
        created: invoice.created,
        invoice_pdf: invoice.invoice_pdf,
        hosted_invoice_url: invoice.hosted_invoice_url,
        lines: invoice.lines.data.map(line => ({
            id: line.id,
            description: line.description,
            amount: line.amount,
            currency: line.currency,
            quantity: line.quantity,
            period: line.period
        }))
      };
    } else {
      return null; // No invoice found
    }
  } catch (error) {
    console.error(`Error calling Stripe API (getLastInvoice for customer ${customerId}):`, error.message);
    let errorMessage = `An unexpected error occurred while trying to retrieve the last invoice for customer ${customerId} from Stripe.`;
    if (error.response) {
      if (error.response.data && error.response.data.error && error.response.data.error.message) {
        errorMessage = `Stripe API Error: ${error.response.data.error.message}`;
      } else if (error.response.statusText) {
        errorMessage = `Stripe API Error: ${error.response.statusText}`;
      } else {
        errorMessage = `Stripe API Error: Status code ${error.response.status}`;
      }
      // For a list endpoint, a 404 might mean the customer doesn't exist or has no invoices,
      // but often it just returns an empty list. Explicit 404 handling might be less common here
      // than for direct ID lookups unless Stripe specifically documents it for this case.
      // The current logic of returning null for empty data array covers "no invoices found".
    } else if (error.request) {
      errorMessage = `No response received from Stripe API when fetching last invoice for customer ${customerId}. Check network connectivity.`;
    } else if (error.message) {
        errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
}

// Main handler function called by server.js
async function handler({ args, auth }) {
  const parsedArgs = ArgsSchema.parse(args);
  const parsedAuth = ConnectionSchema.parse(auth); // Use ConnectionSchema

  return getLastInvoiceInternal({
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
    description: "Fetches the most recent invoice for a given Stripe customer ID.",
    parameters: ArgsSchema.shape,
    auth: ['token'],
    authRequirements: "Requires a Stripe Secret Key as 'token' in the auth object.",
  }
};
