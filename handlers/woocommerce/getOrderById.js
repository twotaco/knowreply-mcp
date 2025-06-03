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
  const validatedConnection = ConnectionSchema.parse(auth);
  const validatedArgs = ArgsSchema.parse(args);

  return getOrderByIdInternal({
    ...validatedConnection, // Spread baseUrl, consumerKey, consumerSecret
    ...validatedArgs      // Spread orderId
  });
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema, // Add this
  meta: {
    description: "Fetches a single order from WooCommerce by its ID.",
    // parameters: ArgsSchema.shape, // server.js /discover logic will use ArgsSchema
    authRequirements: "Requires WooCommerce Base URL, Consumer Key, and Consumer Secret in the auth object.", // Update meta
  }
};
