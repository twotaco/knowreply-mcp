const { z } = require('zod');
const axios = require('axios');

// Zod Schema for arguments
const ArgsSchema = z.object({
  customerId: z.string().optional().describe("ID of the customer whose invoices to retrieve."),
  subscriptionId: z.string().optional().describe("ID of the subscription whose invoices to retrieve."),
  status: z.enum(['draft', 'open', 'paid', 'uncollectible', 'void']).optional().describe("The status of the invoices to retrieve."),
  limit: z.number().int().positive().max(100).optional().describe("A limit on the number of objects to be returned, between 1 and 100."),
  starting_after: z.string().optional().describe("A cursor for use in pagination."),
  ending_before: z.string().optional().describe("A cursor for use in pagination."),
});

// Zod Schema for Stripe connection/authentication object
const ConnectionSchema = z.object({
  token: z.string().min(1, { message: "Stripe API key (secret key) is required." })
});

// Zod Schema for Invoice Price (nested in Line Items)
const InvoicePriceSchema = z.object({
  id: z.string(),
  object: z.literal('price'),
  active: z.boolean(),
  billing_scheme: z.string().optional(),
  created: z.number().int().optional(),
  currency: z.string(),
  // currency_options: z.any().optional(), // For multi-currency prices
  custom_unit_amount: z.any().nullable().optional(),
  livemode: z.boolean().optional(),
  lookup_key: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  nickname: z.string().nullable().optional(),
  product: z.string(), // ID of the product
  recurring: z.any().nullable().optional(), // Recurring object if it's a recurring price
  tax_behavior: z.string().optional(),
  tiers_mode: z.string().nullable().optional(),
  transform_quantity: z.any().nullable().optional(),
  type: z.string().optional(),
  unit_amount: z.number().int().nullable(),
  unit_amount_decimal: z.string().nullable().optional(),
}).passthrough().nullable().optional();

// Zod Schema for Invoice Line Items
const InvoiceLineItemSchema = z.object({
  id: z.string(),
  object: z.literal('line_item'),
  amount: z.number().int(),
  amount_excluding_tax: z.number().int().nullable().optional(),
  currency: z.string(),
  description: z.string().nullable().optional(), // Often optional
  discount_amounts: z.array(z.object({ amount: z.number().int(), discount: z.string() })).nullable().optional(),
  discountable: z.boolean(),
  discounts: z.array(z.string().or(z.any())).nullable().optional(), // Array of discount IDs or discount objects
  invoice_item: z.string().optional(), // ID of the invoiceitem if this line item originated from an invoiceitem
  livemode: z.boolean().optional(),
  metadata: z.record(z.string(), z.any()).nullable().optional(),
  period: z.object({
    end: z.number().int(),
    start: z.number().int(),
  }),
  plan: z.any().nullable().optional(), // Plan object (legacy)
  price: InvoicePriceSchema,
  proration: z.boolean(),
  proration_details: z.object({ credited_items: z.any().nullable() }).passthrough().optional(),
  quantity: z.number().int().nullable(), // Can be null for metered billing etc.
  subscription: z.string().nullable().optional(),
  subscription_item: z.string().nullable().optional(),
  tax_amounts: z.array(z.object({ amount: z.number().int(), inclusive: z.boolean(), tax_rate: z.string() })).nullable().optional(), // tax_rate can be an ID or an object
  tax_rates: z.array(z.any()).nullable().optional(), // Array of tax rate objects
  type: z.enum(['invoiceitem', 'subscription']),
  unit_amount_excluding_tax: z.string().nullable().optional(),
}).passthrough();

// Zod Schema for an individual Stripe Invoice
const InvoiceSchema = z.object({
  id: z.string(),
  object: z.literal('invoice'),
  account_country: z.string().optional(),
  account_name: z.string().nullable().optional(),
  account_tax_ids: z.array(z.string()).nullable().optional(),
  amount_due: z.number().int(),
  amount_paid: z.number().int(),
  amount_remaining: z.number().int(),
  amount_shipping: z.number().int().optional(),
  application: z.string().nullable().optional(),
  application_fee_amount: z.number().int().nullable().optional(),
  attempt_count: z.number().int(),
  attempted: z.boolean(),
  auto_advance: z.boolean().optional(), // Optional as it might not be on older invoices
  automatic_tax: z.object({ enabled: z.boolean(), status: z.string().nullable().optional() }).optional(),
  billing_reason: z.string().nullable().optional(),
  charge: z.string().nullable().optional(), // Can be string (ID) or expanded Charge object
  collection_method: z.enum(['charge_automatically', 'send_invoice']).optional(),
  created: z.number().int(),
  currency: z.string(),
  custom_fields: z.array(z.object({ name: z.string(), value: z.string() })).nullable().optional(),
  customer: z.string().or(z.any()).nullable(), // Customer ID or expanded Customer object
  customer_address: z.any().nullable().optional(), // Address object
  customer_email: z.string().email().nullable().optional(),
  customer_name: z.string().nullable().optional(),
  customer_phone: z.string().nullable().optional(),
  customer_shipping: z.any().nullable().optional(), // Shipping object
  customer_tax_exempt: z.string().nullable().optional(),
  customer_tax_ids: z.array(z.object({ type: z.string(), value: z.string() })).nullable().optional(),
  default_payment_method: z.string().nullable().optional(), // ID or expanded PaymentMethod
  default_source: z.string().nullable().optional(), // ID or expanded Source
  default_tax_rates: z.array(z.any()).optional(), // Array of TaxRate objects
  description: z.string().nullable().optional(),
  discount: z.any().nullable().optional(), // Discount object
  discounts: z.array(z.string().or(z.any())).nullable().optional(), // Array of discount IDs or expanded Discount objects
  due_date: z.number().int().nullable().optional(),
  effective_at: z.number().int().nullable().optional(),
  ending_balance: z.number().int().nullable().optional(),
  footer: z.string().nullable().optional(),
  from_invoice: z.object({ action: z.string(), invoice: z.string() }).nullable().optional(),
  hosted_invoice_url: z.string().url().nullable().optional(),
  invoice_pdf: z.string().url().nullable().optional(),
  last_finalization_error: z.object({ code: z.string().optional(), message: z.string().optional(), param: z.string().optional() }).nullable().optional(),
  latest_revision: z.string().nullable().optional(), // ID of the latest revision Invoice object
  lines: z.object({
    object: z.literal('list'),
    data: z.array(InvoiceLineItemSchema),
    has_more: z.boolean(),
    url: z.string().url(),
    total_count: z.number().int().optional(),
  }).passthrough(),
  livemode: z.boolean(),
  metadata: z.record(z.string(), z.any()).nullable().optional(),
  next_payment_attempt: z.number().int().nullable().optional(),
  number: z.string().nullable().optional(),
  on_behalf_of: z.string().nullable().optional(), // Account ID
  paid: z.boolean(),
  paid_out_of_band: z.boolean(),
  payment_intent: z.string().nullable().optional(), // ID or expanded PaymentIntent
  payment_settings: z.object({
    default_mandate: z.string().nullable().optional(),
    payment_method_options: z.any().nullable().optional(), // Can be complex
    payment_method_types: z.array(z.string()).nullable().optional(),
  }).passthrough().optional(),
  period_end: z.number().int(),
  period_start: z.number().int(),
  post_payment_credit_notes_amount: z.number().int(),
  pre_payment_credit_notes_amount: z.number().int(),
  quote: z.string().nullable().optional(), // ID of a Quote
  receipt_number: z.string().nullable().optional(),
  rendering_options: z.object({ amount_tax_display: z.string().nullable().optional() }).nullable().optional(),
  shipping_cost: z.any().nullable().optional(), // ShippingCost object
  shipping_details: z.any().nullable().optional(), // ShippingDetails object
  starting_balance: z.number().int(),
  statement_descriptor: z.string().nullable().optional(),
  status: z.enum(['draft', 'open', 'paid', 'uncollectible', 'void']).nullable().optional(),
  status_transitions: z.object({
    finalized_at: z.number().int().nullable().optional(),
    marked_uncollectible_at: z.number().int().nullable().optional(),
    paid_at: z.number().int().nullable().optional(),
    voided_at: z.number().int().nullable().optional(),
  }).passthrough().optional(),
  subscription: z.string().nullable().optional(), // ID or expanded Subscription
  subtotal: z.number().int(),
  subtotal_excluding_tax: z.number().int().nullable().optional(),
  tax: z.number().int().nullable().optional(),
  test_clock: z.string().nullable().optional(), // ID of a TestClock
  total: z.number().int(),
  total_discount_amounts: z.array(z.object({ amount: z.number().int(), discount: z.string() })).nullable().optional(),
  total_excluding_tax: z.number().int().nullable().optional(),
  total_tax_amounts: z.array(z.object({ amount: z.number().int(), inclusive: z.boolean(), tax_rate: z.string().or(z.any()) })).nullable().optional(), // tax_rate can be ID or object
  transfer_data: z.any().nullable().optional(), // TransferData object
  webhooks_delivered_at: z.number().int().nullable().optional(),
}).passthrough();

// Zod Schema for the overall API response (list of invoices)
const OutputSchema = z.object({
  object: z.literal('list'),
  data: z.array(InvoiceSchema),
  has_more: z.boolean(),
  url: z.string().url(),
  next_page: z.string().url().nullable().optional(), // Not always present, depends on Stripe's pagination for the specific request
}).passthrough(); // Allows other fields like total_count if present

async function getInvoicesInternal({ apiKey, customerId, subscriptionId, status, limit, starting_after, ending_before }) {
  const params = {};
  if (customerId) params.customer = customerId;
  if (subscriptionId) params.subscription = subscriptionId;
  if (status) params.status = status;
  if (limit) params.limit = limit;
  if (starting_after) params.starting_after = starting_after;
  if (ending_before) params.ending_before = ending_before;

  try {
    const response = await axios.get('https://api.stripe.com/v1/invoices', {
      params,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    });
    return response.data;
  } catch (error) {
    console.error(`Error calling Stripe API (getInvoices):`, error.message);
    let errorMessage = 'An unexpected error occurred while trying to retrieve invoices from Stripe.';
    if (error.response) {
      if (error.response.data && error.response.data.error && error.response.data.error.message) {
        errorMessage = `Stripe API Error: ${error.response.data.error.message}`;
      } else if (error.response.statusText) {
        errorMessage = `Stripe API Error: ${error.response.statusText}`;
      } else {
        errorMessage = `Stripe API Error: Status code ${error.response.status}`;
      }
    } else if (error.request) {
      errorMessage = 'No response received from Stripe API when fetching invoices. Check network connectivity.';
    } else if (error.message) {
        errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
}

// Main handler function called by server.js
async function handler({ args, auth }) {
  const parsedArgs = ArgsSchema.parse(args);
  const parsedAuth = ConnectionSchema.parse(auth); // Use ConnectionSchema here

  return getInvoicesInternal({
    apiKey: parsedAuth.token,
    customerId: parsedArgs.customerId,
    subscriptionId: parsedArgs.subscriptionId,
    status: parsedArgs.status,
    limit: parsedArgs.limit,
    starting_after: parsedArgs.starting_after,
    ending_before: parsedArgs.ending_before,
  });
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema,
  OutputSchema, // Export the OutputSchema
  meta: {
    description: "Fetches a list of invoices from Stripe. Supports filtering by customer ID, subscription ID, status, and pagination.",
    parameters: ArgsSchema.shape,
    auth: ['token'],
    authRequirements: "Requires a Stripe Secret Key as 'token' in the auth object.",
  }
};
