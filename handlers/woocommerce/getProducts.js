const axios = require('axios');
const { z } = require('zod');

// Zod schema for WooCommerce connection details
const ConnectionSchema = z.object({
  baseUrl: z.string().url({ message: "WooCommerce base URL is required." }),
  consumerKey: z.string().min(1, { message: "WooCommerce Consumer Key is required." }),
  consumerSecret: z.string().min(1, { message: "WooCommerce Consumer Secret is required." })
});

// --- Output Schemas ---

const WooCommerceCategorySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
}).passthrough();

const WooCommerceImageSchema = z.object({
  id: z.number().int(),
  date_created: z.string().datetime({ message: "Invalid ISO date format for image date_created" }).optional(),
  date_created_gmt: z.string().datetime({ message: "Invalid ISO date format for image date_created_gmt" }).optional(),
  date_modified: z.string().datetime({ message: "Invalid ISO date format for image date_modified" }).optional(),
  date_modified_gmt: z.string().datetime({ message: "Invalid ISO date format for image date_modified_gmt" }).optional(),
  src: z.string().url(),
  name: z.string().optional(),
  alt: z.string().optional(),
  position: z.number().int().optional(),
}).passthrough();

const WooCommerceAttributeSchema = z.object({
  id: z.number().int().optional(), // 0 for custom attributes
  name: z.string(),
  position: z.number().int().optional(),
  visible: z.boolean().optional(),
  variation: z.boolean().optional(),
  options: z.array(z.string()),
}).passthrough();

const WooCommerceMetaDataSchema = z.object({
  id: z.number().int().optional(),
  key: z.string(),
  value: z.any(),
  display_key: z.string().optional(),
  display_value: z.string().optional(),
}).passthrough();

const WooCommerceProductSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
  permalink: z.string().url().optional(),
  date_created: z.string().datetime({ message: "Invalid ISO date format for date_created" }).optional(),
  date_created_gmt: z.string().datetime({ message: "Invalid ISO date format for date_created_gmt" }).optional(),
  date_modified: z.string().datetime({ message: "Invalid ISO date format for date_modified" }).optional(),
  date_modified_gmt: z.string().datetime({ message: "Invalid ISO date format for date_modified_gmt" }).optional(),
  type: z.enum(['simple', 'grouped', 'external', 'variable', 'virtual', 'downloadable', 'variation']) // Added 'variation'
            .optional(),
  status: z.enum(['draft', 'pending', 'private', 'publish', 'trash']) // Added 'trash'
             .optional(),
  featured: z.boolean().optional(),
  catalog_visibility: z.enum(['visible', 'catalog', 'search', 'hidden']).optional(),
  description: z.string().optional(),
  short_description: z.string().optional(),
  sku: z.string().optional().nullable(), // SKU can be null
  price: z.string(),
  regular_price: z.string(),
  sale_price: z.string().optional().nullable(), // Can be empty string or null
  date_on_sale_from: z.string().datetime({ message: "Invalid ISO date format for sale_from" }).nullable().optional(),
  date_on_sale_from_gmt: z.string().datetime({ message: "Invalid ISO date format for sale_from_gmt" }).nullable().optional(),
  date_on_sale_to: z.string().datetime({ message: "Invalid ISO date format for sale_to" }).nullable().optional(),
  date_on_sale_to_gmt: z.string().datetime({ message: "Invalid ISO date format for sale_to_gmt" }).nullable().optional(),
  on_sale: z.boolean().optional(),
  purchasable: z.boolean().optional(),
  total_sales: z.number().int().optional(),
  virtual: z.boolean().optional(),
  downloadable: z.boolean().optional(),
  downloads: z.array(z.object({ id: z.string(), name: z.string(), file: z.string().url() })).optional(),
  download_limit: z.number().int().optional(),
  download_expiry: z.number().int().optional(),
  external_url: z.string().url().optional(),
  button_text: z.string().optional(),
  tax_status: z.enum(['taxable', 'shipping', 'none']).optional(),
  tax_class: z.string().optional(),
  manage_stock: z.boolean().optional(),
  stock_quantity: z.number().int().nullable().optional(),
  stock_status: z.enum(['instock', 'outofstock', 'onbackorder']).optional(),
  backorders: z.enum(['no', 'notify', 'yes']).optional(),
  backorders_allowed: z.boolean().optional(),
  backordered: z.boolean().optional(),
  sold_individually: z.boolean().optional(),
  weight: z.string().optional().nullable(), // Weight can be null
  dimensions: z.object({
    length: z.string(),
    width: z.string(),
    height: z.string(),
  }).passthrough().optional(),
  shipping_required: z.boolean().optional(),
  shipping_taxable: z.boolean().optional(),
  shipping_class: z.string().optional(),
  shipping_class_id: z.number().int().optional(),
  reviews_allowed: z.boolean().optional(),
  average_rating: z.string().optional(),
  rating_count: z.number().int().optional(),
  related_ids: z.array(z.number().int()).optional(),
  upsell_ids: z.array(z.number().int()).optional(),
  cross_sell_ids: z.array(z.number().int()).optional(),
  parent_id: z.number().int().optional(),
  purchase_note: z.string().optional(),
  categories: z.array(WooCommerceCategorySchema).optional(),
  tags: z.array(z.object({ id: z.number().int(), name: z.string(), slug: z.string() }).passthrough()).optional(),
  images: z.array(WooCommerceImageSchema).optional(),
  attributes: z.array(WooCommerceAttributeSchema).optional(),
  default_attributes: z.array(z.object({ id: z.number().int().optional(), name: z.string(), option: z.string() }).passthrough()).optional(),
  variations: z.array(z.number().int()).optional(),
  grouped_products: z.array(z.number().int()).optional(),
  menu_order: z.number().int().optional(),
  price_html: z.string().optional(),
  meta_data: z.array(WooCommerceMetaDataSchema).optional(),
  _links: z.any().optional(), // Standard WooCommerce _links object
}).passthrough();

// The OutputSchema can be a single product or an array of products.
// It's not nullable because an error is thrown on failure.
const OutputSchema = z.union([WooCommerceProductSchema, z.array(WooCommerceProductSchema)]);
// --- End of Output Schemas ---

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
  ConnectionSchema,
  OutputSchema, // Export the OutputSchema
  meta: {
    description: "Fetches products from WooCommerce. Can fetch a single product by ID, or list/search products.",
    // parameters: ArgsSchema.shape, // server.js /discover logic will use ArgsSchema
    authRequirements: "Requires WooCommerce Base URL, Consumer Key, and Consumer Secret in the auth object.", // Update meta
  }
};
