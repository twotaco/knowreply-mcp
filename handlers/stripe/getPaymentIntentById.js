const { z } = require('zod');
const axios = require('axios');

// Zod Schema for arguments
const ArgsSchema = z.object({
  paymentIntentId: z.string().min(1, { message: "Stripe Payment Intent ID is required." })
  // Stripe API allows 'client_secret' as an optional param for this endpoint,
  // but it's usually for client-side confirmation, not server-side retrieval.
  // expand: z.array(z.string()).optional().describe("Objects to expand."),
});

// Zod Schema for Stripe connection/authentication object
const ConnectionSchema = z.object({
  token: z.string().min(1, { message: "Stripe API key (secret key) is required." })
});

// Zod Schema for Stripe Address (reusable)
const StripeAddressSchema = z.object({
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  line1: z.string().nullable().optional(),
  line2: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
}).passthrough().nullable().optional();

// Zod Schema for Charge objects (often nested in PaymentIntent)
const ChargeSchema = z.object({
  id: z.string(),
  object: z.literal('charge'),
  amount: z.number().int(),
  amount_captured: z.number().int().optional(),
  amount_refunded: z.number().int().optional(),
  application: z.string().nullable().optional(),
  application_fee: z.string().nullable().optional(), // ID of application fee
  application_fee_amount: z.number().int().nullable().optional(),
  balance_transaction: z.string().nullable().optional(), // ID or expanded object
  billing_details: z.object({
    address: StripeAddressSchema,
    email: z.string().email().nullable().optional(),
    name: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
  }).passthrough().optional(),
  calculated_statement_descriptor: z.string().nullable().optional(),
  captured: z.boolean().optional(),
  created: z.number().int(), // Unix timestamp
  currency: z.string(),
  customer: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  dispute: z.string().nullable().optional(), // ID or expanded object
  disputed: z.boolean().optional(),
  failure_balance_transaction: z.string().nullable().optional(),
  failure_code: z.string().nullable().optional(),
  failure_message: z.string().nullable().optional(),
  fraud_details: z.record(z.string(), z.any()).optional(),
  invoice: z.string().nullable().optional(),
  livemode: z.boolean(),
  metadata: z.record(z.string(), z.any()).optional(),
  on_behalf_of: z.string().nullable().optional(),
  order: z.string().nullable().optional(),
  outcome: z.any().nullable().optional(), // Outcome object
  paid: z.boolean(),
  payment_intent: z.string().optional(),
  payment_method: z.string().nullable().optional(),
  payment_method_details: z.any().passthrough().optional(), // PaymentMethodDetails object
  receipt_email: z.string().email().nullable().optional(),
  receipt_number: z.string().nullable().optional(),
  receipt_url: z.string().url().nullable().optional(),
  refunded: z.boolean(),
  refunds: z.object({ // List of refund objects
    object: z.literal('list'),
    data: z.array(z.any()), // Could define a RefundSchema if needed, using z.any() for now
    has_more: z.boolean(),
    url: z.string().url(),
    total_count: z.number().int().optional(),
  }).passthrough().optional(),
  review: z.string().nullable().optional(), // ID or expanded object
  shipping: z.any().nullable().optional(), // Shipping object
  source: z.any().nullable().optional(), // Source object
  source_transfer: z.string().nullable().optional(), // ID or expanded object
  statement_descriptor: z.string().nullable().optional(),
  statement_descriptor_suffix: z.string().nullable().optional(),
  status: z.enum(['succeeded', 'pending', 'failed']),
  transfer: z.string().nullable().optional(), // ID of a transfer
  transfer_data: z.any().nullable().optional(), // TransferData object
  transfer_group: z.string().nullable().optional(),
}).passthrough();

// Zod Schema for a Stripe PaymentIntent
const PaymentIntentSchema = z.object({
  id: z.string(),
  object: z.literal('payment_intent'),
  amount: z.number().int(),
  amount_capturable: z.number().int().optional(),
  amount_details: z.object({ tip: z.object({ amount: z.number().int().optional() }).optional() }).passthrough().optional(),
  amount_received: z.number().int().optional(),
  application: z.string().nullable().optional(),
  application_fee_amount: z.number().int().nullable().optional(),
  automatic_payment_methods: z.object({ enabled: z.boolean() }).nullable().optional(),
  canceled_at: z.number().int().nullable().optional(),
  cancellation_reason: z.enum([
      'duplicate', 'fraudulent', 'requested_by_customer', 'abandoned',
      'failed_invoice', 'void_invoice', 'automatic'
  ]).nullable().optional(),
  capture_method: z.enum(['automatic', 'automatic_async', 'manual']),
  client_secret: z.string().nullable().optional(),
  charges: z.object({
    object: z.literal('list'),
    data: z.array(ChargeSchema), // Using the ChargeSchema defined above
    has_more: z.boolean(),
    url: z.string().url(),
    total_count: z.number().int().optional(),
  }).passthrough().optional(),
  confirmation_method: z.enum(['automatic', 'manual']),
  created: z.number().int(),
  currency: z.string(),
  customer: z.string().nullable().optional(), // Can be an expanded Customer object if requested
  description: z.string().nullable().optional(),
  invoice: z.string().nullable().optional(), // Can be an expanded Invoice object
  last_payment_error: z.object({
    charge: z.string().optional(),
    code: z.string().optional(),
    decline_code: z.string().optional(),
    doc_url: z.string().url().optional(),
    message: z.string().optional(),
    param: z.string().optional(),
    payment_method: z.any().optional(), // PaymentMethod object
    payment_method_type: z.string().optional(),
    setup_intent: z.string().optional(),
    source: z.any().optional(), // Source object
    type: z.string().optional(),
  }).passthrough().nullable().optional(),
  latest_charge: z.string().nullable().optional(), // ID of the latest charge, or expanded Charge
  livemode: z.boolean(),
  metadata: z.record(z.string(), z.any()).nullable().optional(),
  next_action: z.any().passthrough().nullable().optional(), // Can be complex (e.g. redirect_to_url)
  on_behalf_of: z.string().nullable().optional(),
  payment_method: z.string().nullable().optional(), // ID of the PaymentMethod
  payment_method_configuration_details: z.any().nullable().optional(),
  payment_method_options: z.any().passthrough().optional(),
  payment_method_types: z.array(z.string()),
  processing: z.any().passthrough().nullable().optional(),
  receipt_email: z.string().email().nullable().optional(),
  review: z.string().nullable().optional(), // ID of a Review
  setup_future_usage: z.enum(['on_session', 'off_session']).nullable().optional(),
  shipping: z.any().nullable().optional(), // Shipping object
  source: z.string().nullable().optional(), // ID of a Source
  statement_descriptor: z.string().nullable().optional(),
  statement_descriptor_suffix: z.string().nullable().optional(),
  status: z.enum([
    'requires_payment_method',
    'requires_confirmation',
    'requires_action',
    'processing',
    'requires_capture',
    'canceled',
    'succeeded',
  ]),
  transfer_data: z.object({
      destination: z.string().optional(), // Account ID
      amount: z.number().int().optional(),
  }).passthrough().nullable().optional(),
  transfer_group: z.string().nullable().optional(),
}).passthrough();

// OutputSchema is PaymentIntentSchema because the handler throws on error (e.g., not found)
const OutputSchema = PaymentIntentSchema;

async function getPaymentIntentByIdInternal({ paymentIntentId, apiKey /*, expand*/ }) {
  const params = {};
  // if (expand && expand.length > 0) {
  //   params.expand = expand;
  // }

  try {
    const response = await axios.get(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
      params,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    });
    return response.data; // Returns the PaymentIntent object
  } catch (error) {
    console.error(`Error calling Stripe API (getPaymentIntentById for ${paymentIntentId}):`, error.message);
    let errorMessage = `An unexpected error occurred while trying to retrieve Payment Intent ${paymentIntentId} from Stripe.`;
    if (error.response) {
      if (error.response.data && error.response.data.error && error.response.data.error.message) {
        errorMessage = `Stripe API Error: ${error.response.data.error.message}`;
      } else if (error.response.statusText) {
        errorMessage = `Stripe API Error: ${error.response.statusText}`;
      } else {
        errorMessage = `Stripe API Error: Status code ${error.response.status}`;
      }
      if (error.response.status === 404) {
        errorMessage = `Stripe Payment Intent with ID '${paymentIntentId}' not found.`;
      }
    } else if (error.request) {
      errorMessage = `No response received from Stripe API when fetching Payment Intent ${paymentIntentId}. Check network connectivity.`;
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

  return getPaymentIntentByIdInternal({
    paymentIntentId: parsedArgs.paymentIntentId,
    apiKey: parsedAuth.token,
    // expand: parsedArgs.expand,
  });
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema,
  OutputSchema, // Export the OutputSchema
  meta: {
    description: "Fetches a PaymentIntent object from Stripe by its ID.",
    parameters: ArgsSchema.shape,
    auth: ['token'],
    authRequirements: "Requires a Stripe Secret Key as 'token' in the auth object.",
  }
};
