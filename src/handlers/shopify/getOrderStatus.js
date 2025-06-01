const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  orderId: z.string().min(1, { message: "Order ID cannot be empty." })
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "Shopify Admin API token cannot be empty." })
});

// Internal function to simulate a call to the Shopify API
async function _mockShopifyApi_getOrderStatus({ orderId, apiKey }) {
  console.log(`_mockShopifyApi_getOrderStatus: Simulating Shopify API call for orderId: ${orderId}`);
  console.log(`_mockShopifyApi_getOrderStatus: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  if (orderId === "shopify_order_12345") {
    return { // Simulates a found order object from Shopify
      id: orderId,
      name: "#1001", // Order name/number
      financial_status: "paid",
      fulfillment_status: "fulfilled", // or 'unfulfilled', 'partially_fulfilled', null
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
      line_items: [
        {
          id: "li_mock_abc",
          title: "Awesome T-Shirt",
          quantity: 1,
          price: "25.00",
          sku: "TSHIRT-AWESOME-M"
        },
        {
          id: "li_mock_def",
          title: "Cool Cap",
          quantity: 1,
          price: "15.00",
          sku: "CAP-COOL-OS"
        }
      ],
      shipping_lines: [
        {
          title: "Standard Shipping",
          price: "5.00",
          // Shopify often includes estimated delivery times here or in fulfillment data
        }
      ],
      // A very rough mock for estimated delivery
      estimated_delivery_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days from now
    };
  } else if (orderId === "shopify_order_unfulfilled") {
     return {
      id: orderId,
      name: "#1002",
      financial_status: "paid",
      fulfillment_status: null,
      created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      line_items: [{ id: "li_mock_xyz", title: "Magic Mug", quantity: 1, price: "12.50", sku: "MUG-MAGIC" }],
      estimated_delivery_at: null,
    };
  } else {
    return "mock_api_error_order_not_found";
  }
}

async function handleGetOrderStatus({ args, auth }) {
  console.log('Executing MCP: shopify.getOrderStatus');

  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: shopify.getOrderStatus - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid arguments.",
      errors: parsedArgs.error.flatten().fieldErrors,
      data: null
    };
  }

  const parsedAuth = AuthSchema.safeParse(auth);
  if (!parsedAuth.success) {
    console.warn('MCP: shopify.getOrderStatus - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
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
    const orderData = await _mockShopifyApi_getOrderStatus({ orderId, apiKey });

    if (orderData === "mock_api_error_order_not_found") {
      return {
        success: false, // As per design doc, success is true if data is null for "not found"
        message: "Order not found (simulated).",
        data: null,
      };
    } else if (orderData && orderData.id) {
      // Extracting key fields as per design doc example: { "status": "fulfilled", "estimatedDelivery": "2025-06-01", "items": [ ... ] }
      const responseData = {
        orderNumber: orderData.name,
        status: orderData.fulfillment_status || "pending_fulfillment", // More descriptive status
        financialStatus: orderData.financial_status,
        estimatedDelivery: orderData.estimated_delivery_at,
        items: orderData.line_items.map(item => ({
          title: item.title,
          quantity: item.quantity,
          price: item.price,
          sku: item.sku
        })),
        createdAt: orderData.created_at
      };
      return {
        success: true,
        data: responseData,
        message: "Order status retrieved successfully."
      };
    } else {
      // Should not happen with current mock if "mock_api_error_order_not_found" is handled
      return {
        success: false,
        message: "An unexpected error or response occurred while fetching order status.",
        data: null,
      };
    }
  } catch (error) {
    console.error("Error calling _mockShopifyApi_getOrderStatus:", error);
    return {
      success: false,
      message: "An unexpected internal error occurred while trying to retrieve order status.",
      data: null,
    };
  }
}

module.exports = {
  handler: handleGetOrderStatus,
  ArgsSchema: ArgsSchema,
  AuthSchema: AuthSchema
};
