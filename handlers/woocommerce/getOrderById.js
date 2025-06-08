const axios = require('axios');
const { z } = require('zod');

// Zod schema for WooCommerce connection details
const ConnectionSchema = z.object({
  baseUrl: z.string().url({ message: "WooCommerce base URL is required." }),
  consumerKey: z.string().min(1, { message: "WooCommerce Consumer Key is required." }),
  consumerSecret: z.string().min(1, { message: "WooCommerce Consumer Secret is required." })
});

// Zod schema for input arguments
const ArgsSchema = z.object({
  orderId: z.union([
    z.number().int().positive({ message: "Order ID must be a positive integer" }),
    z.string().min(1, { message: "Order ID cannot be empty if a string" })
  ]).describe("The ID of the WooCommerce order to retrieve.")
});

// Zod Schema for a WooCommerce Address
const AddressSchema = z.object({
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
}).passthrough().nullable();

// Zod Schema for WooCommerce Line Items
const LineItemSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  product_id: z.number().int().optional(),
  variation_id: z.number().int().optional(),
  quantity: z.number().int(), // Typically integer
  total: z.string(), // Monetary value as string
  sku: z.string().optional(),
  price: z.string(), // Monetary value as string (price per unit)
}).passthrough();

// Zod Schema for WooCommerce Meta Data
const MetaDataSchema = z.object({
  id: z.number().int().optional(),
  key: z.string(),
  value: z.any(), // Can be any type, including objects or arrays
});

// Zod Schema for the Output (WooCommerce Order)
const OutputSchema = z.object({
  id: z.number().int(),
  parent_id: z.number().int().optional().nullable(), // For refunds or related orders
  status: z.string(),
  currency: z.string(),
  version: z.string().optional(),
  prices_include_tax: z.boolean().optional(),
  date_created: z.string(), // ISO8601 date string
  date_modified: z.string(), // ISO8601 date string
  discount_total: z.string(),
  discount_tax: z.string(),
  shipping_total: z.string(),
  shipping_tax: z.string(),
  cart_tax: z.string(),
  total: z.string(), // Grand total
  total_tax: z.string(),
  customer_id: z.number().int().optional().nullable(), // Optional and nullable for guest orders
  order_key: z.string().optional(),
  billing: AddressSchema,
  shipping: AddressSchema,
  payment_method: z.string().optional(),
  payment_method_title: z.string().optional(),
  transaction_id: z.string().optional().nullable(),
  customer_ip_address: z.string().optional(),
  customer_user_agent: z.string().optional(),
  created_via: z.string().optional(),
  customer_note: z.string().optional().nullable(),
  date_completed: z.string().nullable().optional(), // ISO8601 date string or null
  date_paid: z.string().nullable().optional(), // ISO8601 date string or null
  cart_hash: z.string().optional(),
  number: z.string(), // Order number, often a string
  line_items: z.array(LineItemSchema),
  tax_lines: z.array(z.object({}).passthrough()).optional(), // Define more strictly if needed
  shipping_lines: z.array(z.object({}).passthrough()).optional(), // Define more strictly if needed
  fee_lines: z.array(z.object({}).passthrough()).optional(), // Define more strictly if needed
  coupon_lines: z.array(z.object({}).passthrough()).optional(), // Define more strictly if needed
  refunds: z.array(z.object({}).passthrough()).optional(), // Define more strictly if needed
  meta_data: z.array(MetaDataSchema).optional(),
  // Allows other fields not explicitly defined
}).passthrough();


async function getOrderByIdInternal({ baseUrl, consumerKey, consumerSecret, orderId }) {
  console.log('[WooCommerce.getOrderById] getOrderByIdInternal called with - OrderID:', orderId);
  const url = `${baseUrl.replace(/\/$/, '')}/wp-json/wc/v3/orders/${orderId}`;
  const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  console.log('[WooCommerce.getOrderById] Making API call to URL:', url);
  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('[WooCommerce.getOrderById] API call successful. Response status:', response.status);
    console.log('[WooCommerce.getOrderById] Raw response data (first 250 chars):', JSON.stringify(response.data).substring(0, 250) + (JSON.stringify(response.data).length > 250 ? '...' : ''));
    return response.data; // Returns a single order object
  } catch (error) {
    console.error(`[WooCommerce.getOrderById] Error fetching order ${orderId} from WooCommerce for URL: ${url}: ${error.message}`, error.response?.data);

    let errorMessage = `Failed to fetch order ${orderId} from WooCommerce.`;
    if (error.response) {
      if (error.response.status === 404 && error.response.data && error.response.data.message) {
        errorMessage = `Order ${orderId} not found: ${error.response.data.message}`;
      } else if (error.response.data && error.response.data.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) { // Use error.message if response.data.message is not available
        errorMessage = error.message;
      } else { // Fallback if no specific message found in error object
        errorMessage = `Error status ${error.response.status} while fetching order ${orderId}.`;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
}

async function handler({ args, auth }) {
  console.log('[WooCommerce.getOrderById] Handler invoked with raw args:', JSON.stringify(args, null, 2));
  const validatedConnection = ConnectionSchema.parse(auth);
  const validatedArgs = ArgsSchema.parse(args);
  console.log('[WooCommerce.getOrderById] Validated args:', JSON.stringify(validatedArgs, null, 2));
  console.log('[WooCommerce.getOrderById] Using Connection - BaseURL:', validatedConnection.baseUrl, 'ConsumerKey:', validatedConnection.consumerKey ? validatedConnection.consumerKey.substring(0, 5) + '...' : 'N/A');

  return getOrderByIdInternal({
    ...validatedConnection, // Spread baseUrl, consumerKey, consumerSecret
    ...validatedArgs      // Spread orderId
  });
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema,
  OutputSchema, // Export the OutputSchema
  meta: {
    description: "Fetches a single order from WooCommerce by its ID.",
    // parameters: ArgsSchema.shape, // server.js /discover logic will use ArgsSchema
    authRequirements: "Requires WooCommerce Base URL, Consumer Key, and Consumer Secret in the auth object.", // Update meta
  }
};
