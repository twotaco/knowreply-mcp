const axios = require('axios');
const { z } = require('zod');

// Zod schema for WooCommerce connection details (now part of 'auth' object)
const ConnectionSchema = z.object({
  baseUrl: z.string().url({ message: "WooCommerce base URL is required." }),
  consumerKey: z.string().min(1, { message: "WooCommerce Consumer Key is required." }),
  consumerSecret: z.string().min(1, { message: "WooCommerce Consumer Secret is required." })
});

// --- Output Schemas (Copied from createDraftOrder.js / getOrderById.js) ---

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
}).passthrough().nullable();

// Zod Schema for WooCommerce Line Items (for Output)
const WooCommerceLineItemOutputSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  product_id: z.number().int(),
  variation_id: z.number().int().optional(),
  quantity: z.number().int(),
  total: z.string(),
  sku: z.string().optional(),
  price: z.string(),
  subtotal: z.string().optional(),
  total_tax: z.string().optional(),
  taxes: z.array(z.object({
    id: z.number().int(),
    total: z.string(),
    subtotal: z.string(),
  })).optional(),
  meta_data: z.array(z.object({
    id: z.number().int().optional(),
    key: z.string(),
    value: z.any(),
    display_key: z.string().optional(),
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
}).passthrough(); // Changed from simple object to passthrough for consistency

// Zod Schema for the WooCommerce Order object (for Output)
const WooCommerceOrderOutputSchema = z.object({
  id: z.number().int(),
  parent_id: z.number().int().optional().nullable(),
  status: z.string(),
  currency: z.string(),
  version: z.string().optional(),
  prices_include_tax: z.boolean().optional(),
  date_created: z.string().datetime(),
  date_modified: z.string().datetime(),
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
  number: z.string(),
  line_items: z.array(WooCommerceLineItemOutputSchema),
  tax_lines: z.array(z.object({}).passthrough()).optional(),
  shipping_lines: z.array(z.object({}).passthrough()).optional(),
  fee_lines: z.array(z.object({}).passthrough()).optional(),
  coupon_lines: z.array(z.object({}).passthrough()).optional(),
  refunds: z.array(z.object({}).passthrough()).optional(),
  meta_data: z.array(WooCommerceMetaDataOutputSchema).optional(),
}).passthrough();

// The OutputSchema for the handler is now an object containing an array of Order objects.
// It's not nullable because an error is thrown on failure, and an empty array (within the 'orders' field) is a valid success response.
const OutputSchema = z.object({
  orders: z.array(WooCommerceOrderOutputSchema)
}).describe("A list of WooCommerce orders.");
// --- End of Output Schemas ---

// Zod schema for input arguments (filters, etc.)
const ArgsSchema = z.object({
  email: z.string().email({ message: "Invalid email format." }).optional().describe("Note: This email field is NOT used for direct API filtering of orders. Use 'customerId' for strict customer filtering or 'search' with an email string for a broader search."),
  status: z.string().optional().describe("e.g., 'processing', 'completed', 'on-hold'"),
  search: z.string().optional().describe("Can be used for order number or customer email"),
  customerId: z.union([
    z.number().int().positive(),
    z.string().min(1) // Ensures non-empty string if string
  ]).optional().describe("The WooCommerce customer ID.")
});

async function getOrdersInternal({ baseUrl, consumerKey, consumerSecret, email, status, search, customerId }) {
  console.log('[WooCommerce.getOrders] getOrdersInternal called with - Email:', email, 'Status:', status, 'Search:', search, 'CustomerID:', customerId);
  const params = {};
  // if (email) params.email = email; // Removed as per requirement
  if (status) params.status = status;
  if (search) params.search = search;
  if (customerId) params.customer = customerId;

  if (params.status || params.search || params.customer) {
    params.per_page = 100;
  }
  if (params.per_page) { console.log('[WooCommerce.getOrders] Applied per_page=100 due to active filters.'); }

  const url = `${baseUrl.replace(/\/$/, '')}/wp-json/wc/v3/orders`;
  const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  console.log('[WooCommerce.getOrders] Making API call to URL:', url);
  console.log('[WooCommerce.getOrders] API call params:', JSON.stringify(params, null, 2));

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
      params,
    });
    console.log('[WooCommerce.getOrders] API call successful. Response status:', response.status);
    console.log('[WooCommerce.getOrders] Raw response data (first 250 chars):', JSON.stringify(response.data).substring(0, 250) + (JSON.stringify(response.data).length > 250 ? '...' : ''));
    if (Array.isArray(response.data)) { console.log('[WooCommerce.getOrders] Number of orders received:', response.data.length); }
    return response.data;
  } catch (error) {
    console.error(`[WooCommerce.getOrders] Error fetching orders from WooCommerce: ${error.message} for URL: ${url} with params: ${JSON.stringify(params)}`, error.response?.data);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch orders from WooCommerce.';
    throw new Error(errorMessage);
  }
}

async function handler({ args, auth }) {
  console.log('[WooCommerce.getOrders] Handler invoked with raw args:', JSON.stringify(args, null, 2));
  const validatedConnection = ConnectionSchema.parse(auth); // Parse auth object for connection details
  const validatedArgs = ArgsSchema.parse(args);           // Parse args object for filters
  console.log('[WooCommerce.getOrders] Validated args:', JSON.stringify(validatedArgs, null, 2));
  console.log('[WooCommerce.getOrders] Using Connection - BaseURL:', validatedConnection.baseUrl, 'ConsumerKey:', validatedConnection.consumerKey ? validatedConnection.consumerKey.substring(0, 5) + '...' : 'N/A');

  return getOrdersInternal({
    ...validatedConnection, // Spread baseUrl, consumerKey, consumerSecret
    ...validatedArgs      // Spread email, status, search, customerId
  });
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema,
  OutputSchema, // Export the OutputSchema
  meta: {
    description: "Fetches orders from WooCommerce. For strict filtering by customer, use 'customerId'. The 'search' field can be used with an email string for a broader, non-strict search. Supports filtering by 'status'.",
    // parameters: ArgsSchema.shape, // server.js /discover logic will use ArgsSchema for parameters
    authRequirements: "Requires WooCommerce Base URL, Consumer Key, and Consumer Secret in the auth object.", // Updated meta
  }
};
