const z = require('zod');

// Zod Schemas for validation
const ArgsSchema = z.object({
  email: z.string().email({ message: "Invalid email format." })
});

const AuthSchema = z.object({
  token: z.string().min(1, { message: "Klaviyo API token cannot be empty." })
});

// Mock data for Klaviyo cart status
const mockKlaviyoCartDb = {
  "user@example.com": { // User with an active cart
    profileId: "klaviyo_prof_123",
    cart: {
      cart_id: "klaviyo_cart_abc123",
      items: [
        { product_id: "PROD001", sku: "TSHIRT-AWESOME-M", product_name: "Awesome T-Shirt", quantity: 1, unit_price: "25.00", line_total: "25.00" },
        { product_id: "PROD002", sku: "CAP-COOL-OS", product_name: "Cool Cap", quantity: 2, unit_price: "15.00", line_total: "30.00" }
      ],
      currency: "USD",
      total_amount: "55.00",
      cart_url: "https://example.com/cart/klaviyo_cart_abc123",
      last_updated_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() // 1 hour ago
    }
  },
  "another@example.com": { // User with an empty cart / no active cart
    profileId: "klaviyo_prof_456",
    cart: null
  }
};

// Internal function to simulate a call to the Klaviyo API
async function _mockKlaviyoApi_getCartStatus({ email, apiKey }) {
  console.log(`_mockKlaviyoApi_getCartStatus: Simulating Klaviyo API call for email: ${email}`);
  console.log(`_mockKlaviyoApi_getCartStatus: Using (simulated) API Key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  const profileData = mockKlaviyoCartDb[email];

  if (profileData) {
    return profileData.cart; // This could be null if cart is empty/inactive
  } else if (email === "notfound@example.com") {
    return "mock_api_error_profile_not_found";
  } else {
    // For other emails, simulate profile found but no active cart (same as profileData.cart being null)
    return null;
  }
}

async function handleGetCartStatus({ args, auth }) {
  console.log('Executing MCP: klaviyo.getCartStatus');

  const parsedArgs = ArgsSchema.safeParse(args);
  if (!parsedArgs.success) {
    console.warn('MCP: klaviyo.getCartStatus - Invalid arguments:', parsedArgs.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid arguments.",
      errors: parsedArgs.error.flatten().fieldErrors,
      data: null
    };
  }

  const parsedAuth = AuthSchema.safeParse(auth);
  if (!parsedAuth.success) {
    console.warn('MCP: klaviyo.getCartStatus - Invalid auth:', parsedAuth.error.flatten().fieldErrors);
    return {
      success: false,
      message: "Invalid auth information (Klaviyo API token).",
      errors: parsedAuth.error.flatten().fieldErrors,
      data: null
    };
  }

  const { email } = parsedArgs.data;
  const { token: apiKey } = parsedAuth.data;

  console.log('Received auth token (simulated use for Klaviyo API key):', apiKey ? apiKey.substring(0,5) + '...' : 'No API key provided');

  try {
    const cartData = await _mockKlaviyoApi_getCartStatus({ email, apiKey });

    if (cartData === "mock_api_error_profile_not_found") {
      return {
        success: true,
        message: "Klaviyo profile not found (simulated).",
        data: { // Design doc: "Return cart contents, last updated timestamp." - null if no profile/cart
            email: email,
            cart: null
        }
      };
    } else if (cartData) { // Cart object exists
      // As per design doc: "Return cart contents, last updated timestamp."
      const responseData = {
        cartId: cartData.cart_id,
        items: cartData.items.map(item => ({
          productId: item.product_id,
          sku: item.sku,
          productName: item.product_name,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          lineTotal: item.line_total
        })),
        currency: cartData.currency,
        totalAmount: cartData.total_amount,
        cartUrl: cartData.cart_url, // Added for usefulness
        lastUpdatedAt: cartData.last_updated_at
      };
      return {
        success: true,
        data: {
            email: email,
            cart: responseData
        },
        message: "Active cart status retrieved successfully."
      };
    } else { // cartData is null (profile found, but no active cart)
      return {
        success: true,
        data: {
            email: email,
            cart: null
        },
        message: "Profile found, but no active cart or cart is empty."
      };
    }
  } catch (error) {
    console.error("Error calling _mockKlaviyoApi_getCartStatus:", error);
    return {
      success: false,
      message: "An unexpected internal error occurred while trying to retrieve cart status.",
      data: null,
    };
  }
}

module.exports = {
  handler: handleGetCartStatus,
  ArgsSchema: ArgsSchema,
  AuthSchema: AuthSchema
};
