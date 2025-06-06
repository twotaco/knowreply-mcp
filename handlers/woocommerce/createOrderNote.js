const axios = require('axios');
const { z } = require('zod');

// Zod schema for WooCommerce connection details
const ConnectionSchema = z.object({
  baseUrl: z.string().url({ message: "WooCommerce base URL is required." }),
  consumerKey: z.string().min(1, { message: "WooCommerce Consumer Key is required." }),
  consumerSecret: z.string().min(1, { message: "WooCommerce Consumer Secret is required." })
});

// Zod Schema for the WooCommerce Order Note object (the output of this handler)
const WooCommerceOrderNoteSchema = z.object({
  id: z.number().int(),
  author: z.string().optional(), // Can be 'system' or a user display name
  date_created: z.string().datetime({ message: "Invalid ISO date format for date_created" }),
  date_created_gmt: z.string().datetime({ message: "Invalid ISO date format for date_created_gmt" }),
  note: z.string(),
  customer_note: z.boolean(),
  added_by_user: z.boolean().optional(), // Indicates if the note was added by a staff user via admin UI
  // Other fields like 'user_id' might appear but are less canonical for a generic schema.
}).passthrough(); // Allow other fields WooCommerce might send

// The OutputSchema for the handler. It's not nullable because errors are thrown on failure.
const OutputSchema = WooCommerceOrderNoteSchema;

// Zod schema for input arguments
const ArgsSchema = z.object({
  orderId: z.union([
    z.number().int().positive({ message: "Order ID must be a positive integer" }),
    z.string().min(1, { message: "Order ID cannot be empty if a string" })
  ]).describe("The ID of the WooCommerce order to add a note to."),
  note: z.string().min(1, { message: "Note content cannot be empty" }).describe("The content of the order note."),
  customer_note: z.boolean().optional().default(true).describe("Set to true to have the order note visible with the customer in their order details page, false for a private note for internal staff only. Defaults to true.")
});

// Added customer_note to the destructuring and payload
async function createOrderNoteInternal({ baseUrl, consumerKey, consumerSecret, orderId, note, customer_note }) {
  const url = `${baseUrl.replace(/\/$/, '')}/wp-json/wc/v3/orders/${orderId}/notes`;
  const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  const payload = {
    note: note,
    customer_note: customer_note, // Include customer_note in the payload
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
      } else if (error.message) { // Fallback to error.message if no detailed response message
        errorMessage = error.message;
      } else { // Fallback if no message at all from error object
        errorMessage = `Error status ${error.response.status} while creating note for order ${orderId}.`;
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

  // Pass customer_note to the internal function
  // customer_note will always be present in validatedArgs due to Zod's .default(false)
  return createOrderNoteInternal({
    ...validatedConnection,
    ...validatedArgs      // orderId, note, and customer_note
  });
}

module.exports = {
  handler,
  ArgsSchema,
  ConnectionSchema,
  OutputSchema, // Export the OutputSchema
  meta: {
    description: "Creates a note for a specific order in WooCommerce. Can be a private note (default) or a customer-visible note.", // Updated description
    // parameters: ArgsSchema.shape, // server.js /discover logic will use ArgsSchema
    authRequirements: "Requires WooCommerce Base URL, Consumer Key, and Consumer Secret in the auth object.",
  }
};
