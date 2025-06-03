const axios = require('axios');
const { z } = require('zod');

// Zod schema for WooCommerce connection details
const ConnectionSchema = z.object({
  baseUrl: z.string().url({ message: "WooCommerce base URL is required." }),
  consumerKey: z.string().min(1, { message: "WooCommerce Consumer Key is required." }),
  consumerSecret: z.string().min(1, { message: "WooCommerce Consumer Secret is required." })
});

// Zod schema for input arguments (product ID or search filters)
const ArgsSchema = z.object({
  productId: z.union([
    z.number().int().positive({ message: "Product ID must be a positive integer" }),
    z.string().min(1, { message: "Product ID cannot be empty if a string" })
  ]).optional().describe("The ID of a specific WooCommerce product to retrieve."),
  search: z.string().optional().describe("Search term to find products.")
  // Other common params for listing products: sku, category, tag, status, type, featured, on_sale etc.
  // Keeping it simple with productId and search for now.
});

async function getProductsInternal({ baseUrl, consumerKey, consumerSecret, productId, search }) {
  let url = `${baseUrl.replace(/\/$/, '')}/wp-json/wc/v3/products`;
  const params = {};

  if (productId) {
    // If productId is provided, fetch a single product
    url += `/${productId}`;
  } else {
    // Otherwise, list products, possibly with a search filter
    if (search) params.search = search;
    // Add other query parameters for listing here if needed
  }

  const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
      params: Object.keys(params).length > 0 ? params : undefined,
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching products from WooCommerce: ${error.message}`, error.response?.data);
    let errorMessage = 'Failed to fetch products from WooCommerce.';
    if (productId && error.response && error.response.status === 404) {
        errorMessage = `Product with ID ${productId} not found. ${error.response.data?.message || ''}`.trim();
    } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
    } else if (error.message) {
        errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
}

async function handler({ args, auth }) {
  const validatedConnection = ConnectionSchema.parse(auth);
  const validatedArgs = ArgsSchema.parse(args);

  return getProductsInternal({
    ...validatedConnection, // Spread baseUrl, consumerKey, consumerSecret
    ...validatedArgs      // Spread productId, search
  });
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema, // Add this
  meta: {
    description: "Fetches products from WooCommerce. Can fetch a single product by ID, or list/search products.",
    // parameters: ArgsSchema.shape, // server.js /discover logic will use ArgsSchema
    authRequirements: "Requires WooCommerce Base URL, Consumer Key, and Consumer Secret in the auth object.", // Update meta
  }
};
