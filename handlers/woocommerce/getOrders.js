const axios = require('axios');
const { z } = require('zod');

// Zod schema for WooCommerce connection details (now part of 'auth' object)
const ConnectionSchema = z.object({
  baseUrl: z.string().url({ message: "WooCommerce base URL is required." }),
  consumerKey: z.string().min(1, { message: "WooCommerce Consumer Key is required." }),
  consumerSecret: z.string().min(1, { message: "WooCommerce Consumer Secret is required." })
});

// Zod schema for input arguments (filters, etc.)
const ArgsSchema = z.object({
  email: z.string().email({ message: "Invalid email format." }).optional(),
  status: z.string().optional().describe("e.g., 'processing', 'completed', 'on-hold'"),
  search: z.string().optional().describe("Can be used for order number or customer email"),
  customerId: z.union([
    z.number().int().positive(),
    z.string().min(1) // Ensures non-empty string if string
  ]).optional().describe("The WooCommerce customer ID.")
});

async function getOrdersInternal({ baseUrl, consumerKey, consumerSecret, email, status, search, customerId }) {
  const params = {};
  if (email) params.email = email;
  if (status) params.status = status;
  if (search) params.search = search;
  if (customerId) params.customer = customerId;

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
    return response.data;
  } catch (error) {
    console.error(`Error fetching orders from WooCommerce: ${error.message}`, error.response?.data);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch orders from WooCommerce.';
    throw new Error(errorMessage);
  }
}

async function handler({ args, auth }) {
  const validatedConnection = ConnectionSchema.parse(auth); // Parse auth object for connection details
  const validatedArgs = ArgsSchema.parse(args);           // Parse args object for filters

  return getOrdersInternal({
    ...validatedConnection, // Spread baseUrl, consumerKey, consumerSecret
    ...validatedArgs      // Spread email, status, search, customerId
  });
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema, // Exporting ConnectionSchema
  meta: {
    description: "Fetches orders from WooCommerce. Supports filtering by email, status, customer ID, or a general search term.",
    // parameters: ArgsSchema.shape, // server.js /discover logic will use ArgsSchema for parameters
    authRequirements: "Requires WooCommerce Base URL, Consumer Key, and Consumer Secret in the auth object.", // Updated meta
  }
};
