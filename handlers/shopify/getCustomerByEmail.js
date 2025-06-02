const axios = require('axios');
const { z } = require('zod');

// Define Zod schema for input validation
const ArgsSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
});

// NOTE: Environment variables SHOPIFY_API_KEY, SHOPIFY_API_PASSWORD, SHOPIFY_STORE_DOMAIN
// are expected to be set in the environment where this handler operates.

async function getCustomerByEmailInternal(email) {
  // Access environment variables and construct URL within the function
  // to ensure mocked values are used in tests.
  const { SHOPIFY_API_KEY, SHOPIFY_API_PASSWORD, SHOPIFY_STORE_DOMAIN } = process.env;

  if (!SHOPIFY_API_KEY || !SHOPIFY_API_PASSWORD || !SHOPIFY_STORE_DOMAIN) {
    throw new Error('Shopify API credentials or store domain are not configured.');
  }

  if (!email) {
    // This check is technically redundant due to Zod validation, but kept for direct calls if any
    throw new Error('Email is required to fetch customer information from Shopify.');
  }

  const shopifyUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/2025-04/customers/search.json?query=email:${encodeURIComponent(email)}`;
  const adminAuth = 'Basic ' + Buffer.from(SHOPIFY_API_KEY + ':' + SHOPIFY_API_PASSWORD).toString('base64');

  try {
    const response = await axios.get(shopifyUrl, {
      headers: {
        'Authorization': adminAuth,
        'Content-Type': 'application/json',
      },
    });

    if (response.data && response.data.customers && response.data.customers.length > 0) {
      const customer = response.data.customers[0];
      return {
        id: customer.id,
        firstName: customer.first_name,
        lastName: customer.last_name,
        email: customer.email,
        phone: customer.phone,
        addresses: customer.addresses,
        tags: customer.tags,
        totalSpent: customer.total_spent,
        numberOfOrders: customer.orders_count,
      };
    } else {
      return null;
    }
  } catch (error) {
    // Log the actual error structure for better debugging if it's not an Axios error with a response
    // console.error('Raw error in getCustomerByEmailInternal:', error);
    console.error('Error fetching customer data from Shopify:', error.response ? error.response.data : error.message);
    const errorMessage = error.response && error.response.data && error.response.data.errors
                       ? error.response.data.errors
                       : (error.message || 'Failed to fetch customer data from Shopify.'); // Use error.message if response is not available
    throw new Error(errorMessage);
  }
}

// This is the handler function that server.js will call
async function handler({ args }) {
  // Validate input arguments using Zod schema
  const validatedArgs = ArgsSchema.parse(args);
  return getCustomerByEmailInternal(validatedArgs.email);
}

module.exports = {
  handler,
  ArgsSchema // Export the schema
};
