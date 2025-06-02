const axios = require('axios');
const { z } = require('zod');

// Define Zod schema for input validation
const ArgsSchema = z.object({
  customerId: z.union([z.string().min(1), z.number().int().positive()]), // Removed .describe()
});

// NOTE: Environment variables SHOPIFY_API_KEY, SHOPIFY_API_PASSWORD, SHOPIFY_STORE_DOMAIN
// are expected to be set in the environment where this handler operates.

async function getLatestOrderInternal(customerId) {
  // Access environment variables and construct URL within the function
  // to ensure mocked values are used in tests.
  const { SHOPIFY_API_KEY, SHOPIFY_API_PASSWORD, SHOPIFY_STORE_DOMAIN } = process.env;

  if (!SHOPIFY_API_KEY || !SHOPIFY_API_PASSWORD || !SHOPIFY_STORE_DOMAIN) {
    throw new Error('Shopify API credentials or store domain are not configured.');
  }

  if (!customerId) {
    // Redundant due to Zod, but good for clarity if called directly
    throw new Error('Customer ID is required to fetch orders from Shopify.');
  }

  const shopifyUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-04/orders.json?customer_id=${customerId}&status=any&order=created_at%20desc`;
  const adminAuth = 'Basic ' + Buffer.from(SHOPIFY_API_KEY + ':' + SHOPIFY_API_PASSWORD).toString('base64');

  try {
    const response = await axios.get(shopifyUrl, {
      headers: {
        'Authorization': adminAuth,
        'Content-Type': 'application/json',
      },
    });

    if (response.data && response.data.orders && response.data.orders.length > 0) {
      const latestOrder = response.data.orders[0];
      return {
        id: latestOrder.id,
        orderNumber: latestOrder.order_number,
        createdAt: latestOrder.created_at,
        totalPrice: latestOrder.total_price,
        financialStatus: latestOrder.financial_status,
        fulfillmentStatus: latestOrder.fulfillment_status || 'unfulfilled',
        lineItems: latestOrder.line_items.map(item => ({
          id: item.id,
          title: item.title,
          quantity: item.quantity,
          price: item.price,
          sku: item.sku,
          variantTitle: item.variant_title,
          vendor: item.vendor,
        })),
        shippingAddress: latestOrder.shipping_address,
        billingAddress: latestOrder.billing_address,
        customer: {
          id: latestOrder.customer.id,
          firstName: latestOrder.customer.first_name,
          lastName: latestOrder.customer.last_name,
          email: latestOrder.customer.email,
        }
      };
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error fetching order data from Shopify:', error.response ? error.response.data : error.message);
    const errorMessage = error.response && error.response.data && error.response.data.errors
                       ? error.response.data.errors
                       : (error.message || 'Failed to fetch order data from Shopify.');
    throw new Error(errorMessage);
  }
}

// This is the handler function that server.js will call
async function handler({ args }) {
  // Validate input arguments using Zod schema
  const validatedArgs = ArgsSchema.parse(args);
  return getLatestOrderInternal(validatedArgs.customerId);
}

module.exports = {
  handler,
  ArgsSchema // Export the schema
};
