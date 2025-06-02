const axios = require('axios');
const { z } = require('zod');

// Zod schema for the line items
const LineItemSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().int().positive().default(1),
  variation_id: z.number().int().positive().optional(),
  // You can add more fields like 'meta_data', 'name', 'price' if you want to override product defaults
});

// Zod schema for input validation
const ArgsSchema = z.object({
  baseUrl: z.string().url({ message: "Invalid WooCommerce base URL" }),
  consumerKey: z.string().min(1, { message: "WooCommerce Consumer Key is required" }),
  consumerSecret: z.string().min(1, { message: "WooCommerce Consumer Secret is required" }),
  orderData: z.object({
    customer_id: z.number().int().positive().optional().describe("ID of the customer."),
    billing: z.object({ // Optional, but good for draft orders
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
    shipping: z.object({ // Optional
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
    // currency: z.string().length(3).optional().describe("Currency code, e.g., USD."), // WooCommerce usually infers this
    // payment_method: z.string().optional(), // e.g., 'bacs', 'cod'
    // payment_method_title: z.string().optional(),
  }).describe("Data for the new order."),
});

async function createDraftOrderInternal({ baseUrl, consumerKey, consumerSecret, orderData }) {
  const url = `${baseUrl.replace(/\/$/, '')}/wp-json/wc/v3/orders`;
  const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  // Ensure status is 'draft' if not explicitly set for this handler's purpose
  const payload = {
    ...orderData,
    status: orderData.status || 'draft', // Enforce draft or use provided status
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
    });
    return response.data; // Returns the created order object
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

async function handler({ args }) {
  const validatedArgs = ArgsSchema.parse(args);
  return createDraftOrderInternal(validatedArgs);
}

module.exports = {
  handler,
  ArgsSchema,
  meta: {
    description: "Creates a new order in WooCommerce, typically as a draft order for upsell scenarios.",
    parameters: ArgsSchema.shape,
    authRequirements: "Requires WooCommerce Base URL, Consumer Key, and Consumer Secret.",
  }
};
