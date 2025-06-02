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
  ]).describe("The ID of the WooCommerce order to add a note to."),
  note: z.string().min(1, { message: "Note content cannot be empty" }).describe("The content of the order note."),
  // WooCommerce also supports 'customer_note' (boolean) and 'added_by_user' (boolean)
  // For simplicity, we'll create a private note by default.
  // customer_note: z.boolean().optional().default(false) // To make it a private note vs customer visible
});

async function createOrderNoteInternal({ baseUrl, consumerKey, consumerSecret, orderId, note }) {
  const url = `${baseUrl.replace(/\/$/, '')}/wp-json/wc/v3/orders/${orderId}/notes`;
  const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  const payload = {
    note: note,
    // customer_note: false, // Defaulting to a private note
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
    });
    return response.data; // Returns the created order note object
  } catch (error) {
    console.error(`Error creating order note for order ${orderId} in WooCommerce: ${error.message}`, error.response?.data);

    let errorMessage = `Failed to create note for order ${orderId}.`;
    if (error.response) {
      if (error.response.status === 404 && error.response.data?.message) {
        errorMessage = `Order ${orderId} not found when trying to add note: ${error.response.data.message}`;
      } else if (error.response.data?.message) {
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
  return createOrderNoteInternal(validatedArgs);
}

module.exports = {
  handler,
  ArgsSchema,
  meta: {
    description: "Creates a private note for a specific order in WooCommerce.",
    parameters: ArgsSchema.shape,
    authRequirements: "Requires WooCommerce Base URL, Consumer Key, and Consumer Secret.",
  }
};
