const axios = require('axios');
const { z } = require('zod');

// Zod schema for input validation
const ArgsSchema = z.object({
  baseUrl: z.string().url({ message: "Invalid WooCommerce base URL" }),
  consumerKey: z.string().min(1, { message: "WooCommerce Consumer Key is required" }),
  consumerSecret: z.string().min(1, { message: "WooCommerce Consumer Secret is required" }),
  productId: z.union([
    z.number().int().positive({ message: "Product ID must be a positive integer" }),
    z.string().min(1, { message: "Product ID cannot be empty if a string" })
  ]).optional().describe("The ID of a specific WooCommerce product to retrieve."),
  search: z.string().optional().describe("Search term to find products."),
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
    // Add other query parameters for listing here if needed, e.g.:
    // if (status) params.status = status; // 'publish', 'draft', 'pending', 'private'
    // if (category) params.category = categoryId; // ID of the category
  }

  const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
      params: Object.keys(params).length > 0 ? params : undefined, // Only add params if they exist
    });
    return response.data; // Returns an array of product objects or a single product object
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

async function handler({ args }) {
  const validatedArgs = ArgsSchema.parse(args);
  return getProductsInternal(validatedArgs);
}

module.exports = {
  handler,
  ArgsSchema,
  meta: {
    description: "Fetches products from WooCommerce. Can fetch a single product by ID, or list/search products.",
    parameters: ArgsSchema.shape,
    authRequirements: "Requires WooCommerce Base URL, Consumer Key, and Consumer Secret.",
  }
};
