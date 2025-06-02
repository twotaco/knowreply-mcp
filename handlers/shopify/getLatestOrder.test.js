// handlers/shopify/getLatestOrder.test.js
jest.mock('axios'); // This is hoisted and mocks 'axios' for all imports

// These will be set in beforeEach
let getLatestOrder;
let ArgsSchema; // If needed for specific schema tests
let axios; // To hold the mocked axios module instance for configuration

const OLD_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...OLD_ENV };
  process.env.SHOPIFY_API_KEY = 'test_api_key';
  process.env.SHOPIFY_API_PASSWORD = 'test_api_password';
  process.env.SHOPIFY_STORE_DOMAIN = 'test-store.myshopify.com';

  axios = require('axios');
  axios.get.mockReset();

  const reloadedModule = require('./getLatestOrder');
  getLatestOrder = reloadedModule.handler;
  ArgsSchema = reloadedModule.ArgsSchema;
});

afterAll(() => {
  process.env = OLD_ENV;
});

describe('getLatestOrder Shopify Handler', () => {
  it('should return the latest order for a valid customer ID', async () => {
    const mockCustomerId = 12345;
    const mockOrderDataResponse = {
      data: {
        orders: [{
          id: 67890, order_number: '1001', created_at: '2023-01-15T10:00:00Z', total_price: '150.00', financial_status: 'paid', fulfillment_status: 'fulfilled',
          line_items: [{ id: 1, title: 'Product A', quantity: 1, price: '100.00', sku: 'SKU-A', variant_title: 'Variant X', vendor: 'Vendor 1' }],
          shipping_address: { address1: '123 Main St', city: 'Anytown', zip: '12345', country: 'US' },
          billing_address: { address1: '123 Main St', city: 'Anytown', zip: '12345', country: 'US' },
          customer: { id: mockCustomerId, first_name: 'Test', last_name: 'User', email: 'test@example.com' }
        }, { id: 67889, order_number: '1000', created_at: '2023-01-10T10:00:00Z', total_price: '50.00', financial_status: 'paid', fulfillment_status: 'fulfilled', line_items: [], shipping_address: {}, billing_address: {}, customer: { id: mockCustomerId, first_name: 'Test', last_name: 'User', email: 'test@example.com' }}]
      }
    };
    axios.get.mockResolvedValue(mockOrderDataResponse);

    const result = await getLatestOrder({ args: { customerId: mockCustomerId } });

    expect(axios.get).toHaveBeenCalledWith(
      `https://test-store.myshopify.com/admin/api/2025-04/orders.json?customer_id=${mockCustomerId}&status=any&order=created_at%20desc`,
      expect.objectContaining({ headers: { 'Authorization': expect.stringContaining('Basic '), 'Content-Type': 'application/json' } })
    );
    expect(result).toEqual({
      id: 67890, orderNumber: '1001', createdAt: '2023-01-15T10:00:00Z', totalPrice: '150.00', financialStatus: 'paid', fulfillmentStatus: 'fulfilled',
      lineItems: [{ id: 1, title: 'Product A', quantity: 1, price: '100.00', sku: 'SKU-A', variantTitle: 'Variant X', vendor: 'Vendor 1' }],
      shippingAddress: { address1: '123 Main St', city: 'Anytown', zip: '12345', country: 'US' },
      billingAddress: { address1: '123 Main St', city: 'Anytown', zip: '12345', country: 'US' },
      customer: { id: mockCustomerId, firstName: 'Test', lastName: 'User', email: 'test@example.com' }
    });
  });

  it('should return null if no orders are found for the customer', async () => {
    const mockCustomerId = 67890;
    axios.get.mockResolvedValue({ data: { orders: [] } });

    const result = await getLatestOrder({ args: { customerId: mockCustomerId } });
    expect(result).toBeNull();
  });

  it('should use "unfulfilled" if fulfillment_status is null', async () => {
    const mockCustomerId = 12345;
    const mockOrderDataResponse = {
      data: {
        orders: [{
          id: 67890, order_number: '1001', created_at: '2023-01-15T10:00:00Z', total_price: '150.00', financial_status: 'paid', fulfillment_status: null,
          line_items: [], shipping_address: {}, billing_address: {}, customer: { id: mockCustomerId, first_name: 'Test', last_name: 'User', email: 'test@example.com' }
        }]
      }
    };
    axios.get.mockResolvedValue(mockOrderDataResponse);

    const result = await getLatestOrder({ args: { customerId: mockCustomerId } });
    expect(result.fulfillmentStatus).toBe('unfulfilled');
  });

  it('should throw an error if the Shopify API call fails (generic error)', async () => {
    const mockCustomerId = 11111;
    axios.get.mockRejectedValue(new Error('Shopify API Error'));

    await expect(getLatestOrder({ args: { customerId: mockCustomerId } })).rejects.toThrow('Shopify API Error');
  });

  it('should throw a validation error for an invalid customer ID (e.g. empty string)', async () => {
    try {
      await getLatestOrder({ args: { customerId: "" } });
      expect(true).toBe(false);
    } catch (error) {
      expect(error.name).toBe('ZodError');
      const customerIdError = error.errors.find(e => e.path.includes('customerId'));
      expect(customerIdError).toBeDefined();
      expect(customerIdError.message).toBe('String must contain at least 1 character(s)');
    }
  });

  it('should throw a validation error for an invalid customer ID type (e.g. boolean)', async () => {
    try {
      await getLatestOrder({ args: { customerId: true } });
      expect(true).toBe(false);
    } catch (error) {
      expect(error.name).toBe('ZodError');
      const customerIdError = error.errors.find(e => e.path.includes('customerId'));
      expect(customerIdError).toBeDefined();
      expect(customerIdError.message).toBe('Invalid input');
    }
  });

  it('should throw a validation error if customerId is missing', async () => {
    try {
      await getLatestOrder({ args: {} });
      expect(true).toBe(false);
    } catch (error) {
      expect(error.name).toBe('ZodError');
      const customerIdError = error.errors.find(e => e.path.includes('customerId'));
      expect(customerIdError).toBeDefined();
      // Update expectation to "Invalid input" based on previous test run for unions
      expect(customerIdError.message).toBe('Invalid input');
    }
  });

   it('should handle Shopify API specific error messages', async () => {
    const mockCustomerId = 'errorCustomer';
    const shopifyError = {
      response: { data: { errors: "Specific Shopify order error from API" } }
    };
    axios.get.mockRejectedValue(shopifyError);

    await expect(getLatestOrder({ args: { customerId: mockCustomerId } })).rejects.toThrow("Specific Shopify order error from API");
  });
});
