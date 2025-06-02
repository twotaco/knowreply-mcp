const axios = require('axios');
const { z } = require('zod');

// Zod schema for input validation
const ArgsSchema = z.object({
  baseUrl: z.string().url({ message: "Invalid WooCommerce base URL" }),
  consumerKey: z.string().min(1, { message: "WooCommerce Consumer Key is required" }),
  consumerSecret: z.string().min(1, { message: "WooCommerce Consumer Secret is required" }),
  orderId: z.union([
    z.number().int().positive({ message: "Order ID must be a positive integer" }),
    z.string().min(1, { message: "Order ID cannot be empty if a string" })
  ]).describe("The ID of the WooCommerce order to retrieve."),
});

async function getOrderByIdInternal({ baseUrl, consumerKey, consumerSecret, orderId }) {
  const url = `${baseUrl.replace(/\/$/, '')}/wp-json/wc/v3/orders/${orderId}`;
  const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
    });
    return response.data; // Returns a single order object
  } catch (error) {
    console.error(`Error fetching order ${orderId} from WooCommerce: ${error.message}`, error.response?.data);

    let errorMessage = `Failed to fetch order ${orderId} from WooCommerce.`;
    if (error.response) {
      // WooCommerce often returns a 404 with a specific message if the order doesn't exist
      if (error.response.status === 404 && error.response.data && error.response.data.message) {
        errorMessage = `Order ${orderId} not found: ${error.response.data.message}`;
      } else if (error.response.data && error.response.data.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
}

async function handler({ args }) {
  const validatedArgs = ArgsSchema.parse(args);
  return getOrderByIdInternal(validatedArgs);
}

module.exports = {
  handler,
  ArgsSchema,
  meta: {
    description: "Fetches a single order from WooCommerce by its ID.",
    parameters: ArgsSchema.shape,
    authRequirements: "Requires WooCommerce Base URL, Consumer Key, and Consumer Secret.",
  }
};
