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
    billing: z.object({
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
  ConnectionSchema, // Add this
  LineItemSchema,   // Also export LineItemSchema
  meta: {
    description: "Creates a new order in WooCommerce, typically as a draft order for upsell scenarios.",
    // parameters: ArgsSchema.shape, // server.js /discover logic will use ArgsSchema
    authRequirements: "Requires WooCommerce Base URL, Consumer Key, and Consumer Secret in the auth object.", // Update meta
  }
};
