const axios = require('axios');
const { z } = require('zod');

// Zod schema for input validation
const ArgsSchema = z.object({
  baseUrl: z.string().url({ message: "Invalid WooCommerce base URL" }),
  consumerKey: z.string().min(1, { message: "WooCommerce Consumer Key is required" }),
  consumerSecret: z.string().min(1, { message: "WooCommerce Consumer Secret is required" }),
  email: z.string().email({ message: "Invalid email format" }).optional(),
  search: z.string().optional(),
  // WooCommerce also supports 'role' (e.g., 'customer') if needed, but keeping it simple for now.
});

async function getCustomersInternal({ baseUrl, consumerKey, consumerSecret, email, search }) {
  const params = {};
  if (email) params.email = email;
  if (search) params.search = search;
  // By default, role=customer is often implied or can be set if needed
  // params.role = 'customer'; 

  const url = `${baseUrl.replace(/\/$/, '')}/wp-json/wc/v3/customers`;
  const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
      params,
    });
    return response.data; // Returns an array of customer objects
  } catch (error) {
    console.error(`Error fetching customers from WooCommerce: ${error.message}`, error.response?.data);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch customers from WooCommerce.';
    throw new Error(errorMessage);
  }
}

async function handler({ args }) {
  const validatedArgs = ArgsSchema.parse(args);
  return getCustomersInternal(validatedArgs);
}

module.exports = {
  handler,
  ArgsSchema,
  meta: {
    description: "Fetches customers from WooCommerce. Supports filtering by email or a general search term.",
    parameters: ArgsSchema.shape,
    authRequirements: "Requires WooCommerce Base URL, Consumer Key, and Consumer Secret.",
  }
};
