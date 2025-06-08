const axios = require('axios');
const { z } = require('zod');

// Zod schema for WooCommerce connection details
const ConnectionSchema = z.object({
  baseUrl: z.string().url({ message: "WooCommerce base URL is required." }),
  consumerKey: z.string().min(1, { message: "WooCommerce Consumer Key is required." }),
  consumerSecret: z.string().min(1, { message: "WooCommerce Consumer Secret is required." })
});

// --- Output Schemas ---

// Zod Schema for a WooCommerce Address (used in Customer billing/shipping for Output)
const WooCommerceAddressSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company: z.string().optional(),
  address_1: z.string().optional(),
  address_2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().optional(),
  email: z.string().email().optional(), // Billing/shipping email might differ
  phone: z.string().optional(),
}).passthrough().nullable(); // Address block itself might be null or empty object {}

// Zod Schema for WooCommerce Meta Data (used in Customer for Output)
const WooCommerceMetaDataSchema = z.object({
  id: z.number().int().optional(), // Meta ID
  key: z.string(),
  value: z.any(), // Value can be of any type
}).passthrough();

// Zod Schema for an individual WooCommerce Customer (for Output)
const WooCommerceCustomerSchema = z.object({
  id: z.number().int(),
  date_created: z.string().datetime({ message: "Invalid ISO date format for date_created" }),
  date_created_gmt: z.string().datetime({ message: "Invalid ISO date format for date_created_gmt" }),
  date_modified: z.string().datetime({ message: "Invalid ISO date format for date_modified" }),
  date_modified_gmt: z.string().datetime({ message: "Invalid ISO date format for date_modified_gmt" }),
  email: z.string().email(),
  first_name: z.string(), // WooCommerce typically returns empty string if not set, not null
  last_name: z.string(),  // WooCommerce typically returns empty string if not set, not null
  role: z.string().optional(), // Role like 'customer'
  username: z.string(),
  billing: WooCommerceAddressSchema,
  shipping: WooCommerceAddressSchema,
  is_paying_customer: z.boolean().optional(),
  avatar_url: z.string().url().optional(),
  meta_data: z.array(WooCommerceMetaDataSchema).optional(),
  // Other fields like orders_count, total_spent might appear.
  // _links: z.any().optional(), // Links to related resources
}).passthrough();

// The OutputSchema for the handler is an array of Customer objects.
// It's not nullable because an error is thrown on failure, and an empty array is a valid success response.
const OutputSchema = z.array(WooCommerceCustomerSchema);
// --- End of Output Schemas ---

// Zod schema for input arguments (filters)
const ArgsSchema = z.object({
  email: z.string().email({ message: "Invalid email format" }).optional(),
  search: z.string().optional().describe("Search term for customers (e.g., name, email).")
  // role: z.string().optional().describe("Filter by customer role, e.g., 'customer'.") // Example of other potential WC args
});

async function getCustomersInternal({ baseUrl, consumerKey, consumerSecret, email, search }) {
  console.log('[WooCommerce.getCustomers] getCustomersInternal called with - Email:', email, 'Search:', search);
  const params = {};
  if (email) params.email = email;
  if (search) params.search = search;
  if (email || search) {
    params.per_page = 100;
  }
  if (params.per_page) { console.log('[WooCommerce.getCustomers] Applied per_page=100 due to active filters.'); }
  // By default, role=customer is often implied or can be set if needed
  // params.role = 'customer';

  const url = `${baseUrl.replace(/\/$/, '')}/wp-json/wc/v3/customers`;
  const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  console.log('[WooCommerce.getCustomers] Making API call to URL:', url);
  console.log('[WooCommerce.getCustomers] API call params:', JSON.stringify(params, null, 2));

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
      params,
    });
    console.log('[WooCommerce.getCustomers] API call successful. Response status:', response.status);
    console.log('[WooCommerce.getCustomers] Raw response data (first 250 chars):', JSON.stringify(response.data).substring(0, 250) + (JSON.stringify(response.data).length > 250 ? '...' : ''));
    if (Array.isArray(response.data)) { console.log('[WooCommerce.getCustomers] Number of customers received:', response.data.length); }
    return response.data; // Returns an array of customer objects
  } catch (error) {
    console.error(`[WooCommerce.getCustomers] Error fetching customers from WooCommerce: ${error.message} for URL: ${url} with params: ${JSON.stringify(params)}`, error.response?.data);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch customers from WooCommerce.';
    throw new Error(errorMessage);
  }
}

async function handler({ args, auth }) {
  console.log('[WooCommerce.getCustomers] Handler invoked with raw args:', JSON.stringify(args, null, 2));
  const validatedConnection = ConnectionSchema.parse(auth);
  const validatedArgs = ArgsSchema.parse(args);
  console.log('[WooCommerce.getCustomers] Validated args:', JSON.stringify(validatedArgs, null, 2));
  console.log('[WooCommerce.getCustomers] Using Connection - BaseURL:', validatedConnection.baseUrl, 'ConsumerKey:', validatedConnection.consumerKey ? validatedConnection.consumerKey.substring(0, 5) + '...' : 'N/A');

  return getCustomersInternal({
    ...validatedConnection, // Spread baseUrl, consumerKey, consumerSecret
    ...validatedArgs      // Spread email, search
  });
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema,
  OutputSchema, // Export the OutputSchema
  meta: {
    description: "Fetches customers from WooCommerce. Supports filtering by email or a general search term.",
    // parameters: ArgsSchema.shape, // server.js /discover logic will use ArgsSchema
    authRequirements: "Requires WooCommerce Base URL, Consumer Key, and Consumer Secret in the auth object.", // Update meta
  }
};
