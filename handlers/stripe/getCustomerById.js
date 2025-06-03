const { z } = require('zod');
const axios = require('axios');

// Zod Schema for arguments
const ArgsSchema = z.object({
  customerId: z.string().min(1, { message: "Stripe Customer ID is required." })
  // Common expansions for customer: 'subscriptions', 'sources', 'default_source', 'tax_ids'
  // expand: z.array(z.string()).optional().describe("Objects to expand in the response, e.g., ['subscriptions']"),
});

// Zod Schema for Stripe connection/authentication object
const ConnectionSchema = z.object({
  token: z.string().min(1, { message: "Stripe API key (secret key) is required." })
});

// Zod Schema for the output of the handler (Stripe Customer Object)
const OutputSchema = z.object({
  id: z.string(),
  object: z.literal('customer'),
  address: z.object({
    city: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    line1: z.string().nullable().optional(),
    line2: z.string().nullable().optional(),
    postal_code: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
  }).nullable().optional(),
  balance: z.number().int().optional(),
  created: z.number().int(), // Unix timestamp
  currency: z.string().nullable().optional(), // Optional because it might not always be set
  default_source: z.string().nullable().optional(),
  delinquent: z.boolean().nullable().optional(),
  description: z.string().nullable().optional(),
  discount: z.any().nullable().optional(),
  email: z.string().email().nullable().optional(),
  invoice_prefix: z.string().nullable().optional(),
  invoice_settings: z.object({
    custom_fields: z.array(z.object({ name: z.string(), value: z.string() })).nullable().optional(),
    default_payment_method: z.string().nullable().optional(),
    footer: z.string().nullable().optional(),
    rendering_options: z.any().nullable().optional(), // Added rendering_options
  }).nullable().optional(),
  livemode: z.boolean(),
  metadata: z.record(z.string(), z.any()).optional(), // metadata can be an empty object {}
  name: z.string().nullable().optional(),
  next_invoice_sequence: z.number().int().optional(), // Added next_invoice_sequence
  phone: z.string().nullable().optional(),
  preferred_locales: z.array(z.string()).nullable().optional(),
  shipping: z.object({
    address: z.object({
      city: z.string().nullable().optional(),
      country: z.string().nullable().optional(),
      line1: z.string().nullable().optional(),
      line2: z.string().nullable().optional(),
      postal_code: z.string().nullable().optional(),
      state: z.string().nullable().optional(),
    }).nullable().optional(),
    name: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    carrier: z.string().nullable().optional(), // Added carrier
    tracking_number: z.string().nullable().optional(), // Added tracking_number
  }).nullable().optional(),
  tax_exempt: z.enum(['none', 'exempt', 'reverse']).nullable().optional(),
  // Note: Fields like 'subscriptions', 'sources', 'tax_ids' are typically expanded.
  // This schema primarily covers the default customer object structure.
}).passthrough(); // Allow other fields Stripe might send, especially with API version changes

async function getCustomerByIdInternal({ customerId, apiKey /*, expand*/ }) {
  const params = {};
  // if (expand && expand.length > 0) {
  //   params.expand = expand;
  // }

  try {
    const response = await axios.get(`https://api.stripe.com/v1/customers/${customerId}`, {
      params,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      }
    });

    return response.data;
  } catch (error) {
    console.error(`Error calling Stripe API (getCustomerById for ${customerId}):`, error.message);
    let errorMessage = `An unexpected error occurred while trying to retrieve customer ${customerId} from Stripe.`;
    if (error.response) {
      if (error.response.data && error.response.data.error && error.response.data.error.message) {
        errorMessage = `Stripe API Error: ${error.response.data.error.message}`;
      } else if (error.response.statusText) {
        errorMessage = `Stripe API Error: ${error.response.statusText}`;
      } else {
        errorMessage = `Stripe API Error: Status code ${error.response.status}`;
      }
      if (error.response.status === 404) {
        errorMessage = `Stripe Customer with ID '${customerId}' not found.`;
      }
    } else if (error.request) {
      errorMessage = `No response received from Stripe API when fetching customer ${customerId}. Check network connectivity.`;
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

  return getCustomerByIdInternal({
    customerId: parsedArgs.customerId,
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
    description: "Fetches a customer object from Stripe by its ID. Can optionally expand related objects like subscriptions.",
    parameters: ArgsSchema.shape,
    auth: ['token'],
    authRequirements: "Requires a Stripe Secret Key as 'token' in the auth object.",
  }
};
