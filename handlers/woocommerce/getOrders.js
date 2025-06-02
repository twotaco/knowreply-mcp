const axios = require('axios');
const { z } = require('zod');

// Zod schema for input validation
const ArgsSchema = z.object({
  baseUrl: z.string().url({ message: "Invalid WooCommerce base URL" }),
  consumerKey: z.string().min(1, { message: "WooCommerce Consumer Key is required" }),
  consumerSecret: z.string().min(1, { message: "WooCommerce Consumer Secret is required" }),
  email: z.string().email().optional(),
  status: z.string().optional(), // e.g., 'processing', 'completed', 'on-hold'
  search: z.string().optional(), // Can be used for order number or customer email
  // Note: Searching by 'id' directly isn't a standard WC API query param for listing orders.
  // Usually, you get a specific order by its ID using /orders/{id}.
  // 'search' can often find an order by its number.
  // If 'id' is meant to be order number, 'search' is the typical param.
  // If it means customer ID, then it's often 'customer:ID_HERE' in search or a specific 'customer' param.
  // For simplicity, we'll rely on 'search' for ID-like queries and 'customer' for customer ID.
  customerId: z.union([z.number().int(), z.string()]).optional(),
});

async function getOrdersInternal({ baseUrl, consumerKey, consumerSecret, email, status, search, customerId }) {
  const params = {};
  if (email) params.email = email; // This might not be a direct filter, often handled by 'search'
  if (status) params.status = status;
  if (search) params.search = search; // Good for order number or partial email/name
  if (customerId) params.customer = customerId; // WC uses 'customer' for customer ID

  const url = `${baseUrl.replace(/\/$/, '')}/wp-json/wc/v3/orders`;
  const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
      params,
    });
    return response.data; // Returns an array of order objects
  } catch (error) {
    console.error(`Error fetching orders from WooCommerce: ${error.message}`, error.response?.data);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch orders from WooCommerce.';
    throw new Error(errorMessage);
  }
}

async function handler({ args, auth }) { // auth object is expected from server.js
  // The main server.js passes auth.token and other potential auth fields.
  // We expect auth.token to be "KEY:SECRET" and auth.baseUrl for WooCommerce.
  // If not, this handler might need to be adapted or the server.js needs to ensure this structure.
  // For now, assuming args will contain all necessary fields including auth details directly.
  // This is a common pattern if abstracting auth further up.
  // Let's adjust to assume auth details are passed within `args` as per Zod schema for now.

  const validatedArgs = ArgsSchema.parse(args);
  return getOrdersInternal(validatedArgs);
}

module.exports = {
  handler,
  ArgsSchema,
  meta: { // Optional: For richer discovery
    description: "Fetches orders from WooCommerce. Supports filtering by email, status, customer ID, or a general search term.",
    parameters: ArgsSchema.shape, // Exposes Zod shape for documentation
    authRequirements: "Requires WooCommerce Base URL, Consumer Key, and Consumer Secret.",
  }
};
