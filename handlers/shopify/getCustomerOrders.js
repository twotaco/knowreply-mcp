const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  email: z.string().email({ message: "Invalid email format." })
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "Shopify Admin API token cannot be empty." })
});

// Mock data for customer orders
const mockCustomerOrdersDb = {
  "customer@example.com": {
    customerId: "shopify_cust_123",
    orders: [
      { id: "shopify_order_1001", name: "#1001", financial_status: "paid", fulfillment_status: "fulfilled", total_price: "30.00", created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() },
      { id: "shopify_order_1002", name: "#1002", financial_status: "paid", fulfillment_status: "unfulfilled", total_price: "45.00", created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
      { id: "shopify_order_1003", name: "#1003", financial_status: "refunded", fulfillment_status: "fulfilled", total_price: "20.00", created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
      // Add more to test the "last 5" logic if desired, though mock will just return these 3 for this email
    ]
  },
  "another@example.com": {
    customerId: "shopify_cust_456",
    orders: [
      { id: "shopify_order_2001", name: "#2001", financial_status: "paid", fulfillment_status: "fulfilled", total_price: "100.00", created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
    ]
  }
};

// Internal function to simulate a call to the Shopify API
async function _mockShopifyApi_getCustomerOrders({ email, apiKey }) {
  console.log(`_mockShopifyApi_getCustomerOrders: Simulating Shopify API call for customer email: ${email}`);
  console.log(`_mockShopifyApi_getCustomerOrders: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  const customerData = mockCustomerOrdersDb[email];

  if (customerData) {
    // Simulate returning last 5 orders (already handled by mock data structure for simplicity)
    // In a real API, you'd fetch customer by email, then fetch their orders with a limit.
    return customerData.orders;
  } else if (email === "notfound@example.com") {
    return "mock_api_error_customer_not_found";
  } else {
    // For other emails, simulate customer found but no orders
    return [];
  }
}

async function handleGetCustomerOrders({ args, auth }) {
  console.log('Executing MCP: shopify.getCustomerOrders');

  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: shopify.getCustomerOrders - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid arguments.",
      errors: parsedArgs.error.flatten().fieldErrors,
      data: null
    };
  }

  const parsedAuth = AuthSchema.safeParse(auth);
  if (!parsedAuth.success) {
    console.warn('MCP: shopify.getCustomerOrders - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid auth information (Shopify Admin API token).",
      errors: parsedAuth.error.flatten().fieldErrors,
      data: null
    };
  }

  const { email } = parsedArgs.data;
  const { token: apiKey } = parsedAuth.data;

  console.log('Received auth token (simulated use for Shopify Admin API key):', apiKey ? apiKey.substring(0,5) + '...' : 'No API key provided');

  try {
    const orders = await _mockShopifyApi_getCustomerOrders({ email, apiKey });

    if (orders === "mock_api_error_customer_not_found") {
      return {
        success: true, // Customer lookup was successful, but no customer found
        message: "Customer not found (simulated).",
        data: { // Consistent with design: "Return simplified array of order summaries." - empty if no customer
            email: email,
            orders: []
        }
      };
    } else if (Array.isArray(orders)) {
      // As per design doc: "Return simplified array of order summaries."
      const simplifiedOrders = orders.map(order => ({
        orderId: order.id,
        orderNumber: order.name,
        status: order.fulfillment_status || "pending_fulfillment",
        financialStatus: order.financial_status,
        totalPrice: order.total_price,
        createdAt: order.created_at
      }));

      return {
        success: true,
        data: {
            email: email, // Include the queried email for context
            orders: simplifiedOrders
        },
        message: orders.length > 0 ? "Customer orders retrieved successfully." : "Customer found, but has no orders."
      };
    } else {
      // Should not happen with current mock
      return {
        success: false,
        message: "An unexpected error or response occurred while fetching customer orders.",
        data: null,
      };
    }
  } catch (error) {
    console.error("Error calling _mockShopifyApi_getCustomerOrders:", error);
    return {
      success: false,
      message: "An unexpected internal error occurred while trying to retrieve customer orders.",
      data: null,
    };
  }
}

module.exports = handleGetCustomerOrders;
