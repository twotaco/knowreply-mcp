const axios = require('axios');
const { z } = require('zod');

// Zod schema for WooCommerce connection details
const ConnectionSchema = z.object({
  baseUrl: z.string().url({ message: "WooCommerce base URL is required." }),
  consumerKey: z.string().min(1, { message: "WooCommerce Consumer Key is required." }),
  consumerSecret: z.string().min(1, { message: "WooCommerce Consumer Secret is required." })
});

// Zod schema for the line items (defined before ArgsSchema uses it)
const LineItemSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().int().positive().default(1),
  variation_id: z.number().int().positive().optional(),
  // You can add more fields like 'meta_data', 'name', 'price' if you want to override product defaults
});

// Zod schema for input arguments (orderData)
const ArgsSchema = z.object({
  orderData: z.object({
    customer_id: z.number().int().positive().optional().describe("ID of the customer."),
    billing: z.object({ // This is for input, keep as is
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        address_1: z.string().optional(),
        address_2: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postcode: z.string().optional(),
        country: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
    }).optional(),
    shipping: z.object({
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        address_1: z.string().optional(),
        address_2: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        postcode: z.string().optional(),
        country: z.string().optional(),
    }).optional(),
    line_items: z.array(LineItemSchema).min(1, { message: "Order must have at least one line item." }),
    status: z.enum(['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed', 'draft'])
             .default('draft')
             .describe("Order status. Defaults to 'draft' for new draft orders."),
    // currency: z.string().length(3).optional().describe("Currency code, e.g., USD."),
    // payment_method: z.string().optional(),
    // payment_method_title: z.string().optional(),
  }).describe("Data for the new order."),
});


// --- Output Schemas (Copied and adapted from getOrderById.js) ---

// Zod Schema for a WooCommerce Address (for Output)
const WooCommerceAddressOutputSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company: z.string().optional(),
  address_1: z.string().optional(),
  address_2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
}).passthrough().nullable(); // Address can be nullable or not present in the response

// Zod Schema for WooCommerce Line Items (for Output)
// Renamed to avoid conflict with the input LineItemSchema
const WooCommerceLineItemOutputSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  product_id: z.number().int(), // In response, product_id is usually present
  variation_id: z.number().int().optional(),
  quantity: z.number().int(),
  total: z.string(), // Monetary value as string
  sku: z.string().optional(),
  price: z.string(), // Monetary value as string (price per unit in response, might be different from calculated total)
  subtotal: z.string().optional(),
  total_tax: z.string().optional(),
  taxes: z.array(z.object({
    id: z.number().int(),
    total: z.string(),
    subtotal: z.string(),
  })).optional(),
  meta_data: z.array(z.object({ // Expect meta_data in line items in the response
    id: z.number().int().optional(),
    key: z.string(),
    value: z.any(),
    display_key: z.string().optional(), // WooCommerce often includes display_key/value
    display_value: z.string().optional(),
  })).optional(),
}).passthrough();

// Zod Schema for WooCommerce Meta Data (for Output)
const WooCommerceMetaDataOutputSchema = z.object({
  id: z.number().int().optional(),
  key: z.string(),
  value: z.any(),
  display_key: z.string().optional(),
  display_value: z.string().optional(),
});

// Zod Schema for the Output (WooCommerce Order object response)
const WooCommerceOrderOutputSchema = z.object({
  id: z.number().int(),
  parent_id: z.number().int().optional().nullable(),
  status: z.string(),
  currency: z.string(),
  version: z.string().optional(),
  prices_include_tax: z.boolean().optional(),
  date_created: z.string(), // ISO8601 date string
  date_modified: z.string(), // ISO8601 date string
  discount_total: z.string().optional(),
  discount_tax: z.string().optional(),
  shipping_total: z.string().optional(),
  shipping_tax: z.string().optional(),
  cart_tax: z.string().optional(),
  total: z.string(),
  total_tax: z.string().optional(),
  customer_id: z.number().int().optional().nullable(),
  order_key: z.string().optional(),
  billing: WooCommerceAddressOutputSchema,
  shipping: WooCommerceAddressOutputSchema,
  payment_method: z.string().optional(),
  payment_method_title: z.string().optional(),
  transaction_id: z.string().optional().nullable(),
  customer_ip_address: z.string().optional(),
  customer_user_agent: z.string().optional(),
  created_via: z.string().optional(),
  customer_note: z.string().optional().nullable(),
  date_completed: z.string().nullable().optional(),
  date_paid: z.string().nullable().optional(),
  cart_hash: z.string().optional(),
  number: z.string(), // Order number
  line_items: z.array(WooCommerceLineItemOutputSchema),
  tax_lines: z.array(z.object({}).passthrough()).optional(),
  shipping_lines: z.array(z.object({}).passthrough()).optional(),
  fee_lines: z.array(z.object({}).passthrough()).optional(),
  coupon_lines: z.array(z.object({}).passthrough()).optional(),
  refunds: z.array(z.object({}).passthrough()).optional(),
  meta_data: z.array(WooCommerceMetaDataOutputSchema).optional(),
  // Allows other fields not explicitly defined, as WooCommerce order objects can be extensive
}).passthrough();

// The final OutputSchema for the handler is the WooCommerceOrderOutputSchema
const OutputSchema = WooCommerceOrderOutputSchema;
// --- End of Output Schemas ---


async function createDraftOrderInternal({ baseUrl, consumerKey, consumerSecret, orderData }) {
  const url = `${baseUrl.replace(/\/$/, '')}/wp-json/wc/v3/orders`;
  const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  const payload = {
    ...orderData,
    status: orderData.status || 'draft',
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error) {
    console.error(`Error creating draft order in WooCommerce: ${error.message}`, error.response?.data);

    let errorMessage = 'Failed to create draft order.';
    if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
    } else if (error.message) {
        errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
}

async function handler({ args, auth }) {
  const validatedConnection = ConnectionSchema.parse(auth);
  const validatedArgs = ArgsSchema.parse(args); // This now expects args to be { orderData: { ... } }

  return createDraftOrderInternal({
    ...validatedConnection,      // Spread baseUrl, consumerKey, consumerSecret
    orderData: validatedArgs.orderData // Pass the nested orderData object
  });
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema,
  LineItemSchema,   // Keep exporting the input LineItemSchema for Args
  OutputSchema,     // Export the new OutputSchema
  meta: {
    description: "Creates a new order in WooCommerce, typically as a draft order for upsell scenarios.",
    // parameters: ArgsSchema.shape, // server.js /discover logic will use ArgsSchema
    authRequirements: "Requires WooCommerce Base URL, Consumer Key, and Consumer Secret in the auth object.", // Update meta
  }
};
