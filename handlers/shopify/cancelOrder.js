const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  orderId: z.string().min(1, { message: "Order ID cannot be empty." }),
  // Optional: reason for cancellation, amount for partial refund etc.
  // For now, keeping it simple as per initial design doc.
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "Shopify Admin API token cannot be empty." })
});

// Mock data store for orders (to simulate state changes)
const mockShopifyOrders = {
  "shopify_order_12345": { // Assumed to be fulfilled or shipped, thus not cancellable
    id: "shopify_order_12345",
    cancellable: false,
    status: "fulfilled",
    cancelled_at: null
  },
  "shopify_order_unfulfilled": { // Assumed to be unfulfilled, thus cancellable
    id: "shopify_order_unfulfilled",
    cancellable: true,
    status: "unfulfilled", // Or 'pending'
    cancelled_at: null
  },
  "shopify_order_already_cancelled": {
    id: "shopify_order_already_cancelled",
    cancellable: false,
    status: "cancelled",
    cancelled_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() // 1 day ago
  }
};

// Internal function to simulate a call to the Shopify API
async function _mockShopifyApi_cancelOrder({ orderId, apiKey }) {
  console.log(`_mockShopifyApi_cancelOrder: Simulating Shopify API call to cancel orderId: ${orderId}`);
  console.log(`_mockShopifyApi_cancelOrder: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  const order = mockShopifyOrders[orderId];

  if (!order) {
    return "mock_api_error_order_not_found";
  }

  if (order.status === "cancelled") {
    return "mock_api_error_already_cancelled";
  }

  if (!order.cancellable) {
    return "mock_api_error_not_cancellable";
  }

  // Simulate successful cancellation
  order.cancellable = false;
  order.status = "cancelled";
  order.cancelled_at = new Date().toISOString();

  return { // Simulates a successful cancellation response (often the updated order object or a specific cancellation object)
    id: order.id,
    status: order.status,
    cancelled_at: order.cancelled_at,
    // May include refund details if applicable
  };
}

async function handleCancelOrder({ args, auth }) {
  console.log('Executing MCP: shopify.cancelOrder');

  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: shopify.cancelOrder - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid arguments.",
      errors: parsedArgs.error.flatten().fieldErrors,
      data: null
    };
  }

  const parsedAuth = AuthSchema.safeParse(auth);
  if (!parsedAuth.success) {
    console.warn('MCP: shopify.cancelOrder - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid auth information (Shopify Admin API token).",
      errors: parsedAuth.error.flatten().fieldErrors,
      data: null
    };
  }

  const { orderId } = parsedArgs.data;
  const { token: apiKey } = parsedAuth.data;

  console.log('Received auth token (simulated use for Shopify Admin API key):', apiKey ? apiKey.substring(0,5) + '...' : 'No API key provided');

  try {
    const cancellationResult = await _mockShopifyApi_cancelOrder({ orderId, apiKey });

    if (cancellationResult === "mock_api_error_order_not_found") {
      return {
        success: false,
        message: "Order not found (simulated).",
        data: null,
      };
    } else if (cancellationResult === "mock_api_error_already_cancelled") {
      const order = mockShopifyOrders[orderId];
      return {
        success: false, // Or true, with a specific message? Design doc: "Return status with timestamp."
        message: "Order was already cancelled.",
        data: {
          orderId: order.id,
          status: order.status,
          cancelledAt: order.cancelled_at
        }
      };
    } else if (cancellationResult === "mock_api_error_not_cancellable") {
      return {
        success: false,
        message: "Order is not cancellable (e.g., already shipped or fulfilled).",
        data: {
            orderId: orderId,
            status: mockShopifyOrders[orderId]?.status // provide current status
        }
      };
    } else if (cancellationResult && cancellationResult.status === "cancelled") {
      // As per design doc: "Return status with timestamp."
      return {
        success: true,
        data: {
          orderId: cancellationResult.id,
          status: cancellationResult.status,
          cancelledAt: cancellationResult.cancelled_at
        },
        message: "Order cancelled successfully."
      };
    } else {
      return {
        success: false,
        message: "An unexpected error or response occurred during order cancellation.",
        data: null,
      };
    }
  } catch (error) {
    console.error("Error calling _mockShopifyApi_cancelOrder:", error);
    return {
      success: false,
      message: "An unexpected internal error occurred while trying to cancel the order.",
      data: null,
    };
  }
}

module.exports = handleCancelOrder;
