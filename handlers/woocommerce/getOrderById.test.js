// handlers/woocommerce/getOrderById.test.js
const { handler, ArgsSchema, ConnectionSchema } = require('./getOrderById'); // Import ConnectionSchema
const axios = require('axios');

jest.mock('axios');

const mockBaseUrl = 'https://teststore.com';
const mockConsumerKey = 'ck_test_key';
const mockConsumerSecret = 'cs_test_secret';
const mockOrderId = 123; // Default numeric order ID for tests

describe('WooCommerce getOrderById Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  // Define validAuth and base args for reuse
  const validAuth = {
    baseUrl: mockBaseUrl,
    consumerKey: mockConsumerKey,
    consumerSecret: mockConsumerSecret
  };
  const validBaseArgs = { orderId: mockOrderId };
  const emptyArgs = {}; // For testing missing orderId

  it('should fetch an order by ID with basic auth', async () => {
    const mockOrder = { id: mockOrderId, total: '150', currency: 'USD' };
    axios.get.mockResolvedValue({ data: mockOrder });

    const result = await handler({ args: validBaseArgs, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wc/v3/orders/${mockOrderId}`,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${mockConsumerKey}:${mockConsumerSecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      }
    );
    expect(result).toEqual(mockOrder);
  });

  it('should accept string orderId', async () => {
    const stringOrderId = "order_abc123";
    const argsWithStringOrderId = { orderId: stringOrderId };
    const mockOrder = { id: stringOrderId, total: '150', currency: 'USD' };
    axios.get.mockResolvedValue({ data: mockOrder });

    const result = await handler({ args: argsWithStringOrderId, auth: validAuth });
     expect(axios.get).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wc/v3/orders/${stringOrderId}`,
      expect.objectContaining({
         headers: {
          'Authorization': `Basic ${Buffer.from(`${mockConsumerKey}:${mockConsumerSecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      })
    );
    expect(result).toEqual(mockOrder);
  });

  it('should handle order not found (404) specifically', async () => {
    const apiError = new Error('Request failed with status code 404');
    apiError.response = {
      status: 404,
      data: { code: 'woocommerce_rest_shop_order_invalid_id', message: 'Invalid ID.' }
    };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: validBaseArgs, auth: validAuth })).rejects.toThrow(`Order ${mockOrderId} not found: Invalid ID.`);
  });

  it('should handle other API errors from WooCommerce', async () => {
    const apiError = new Error('WooCommerce API Error');
    apiError.response = { status: 500, data: { message: 'Internal Server Error' } };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: validBaseArgs, auth: validAuth })).rejects.toThrow('Internal Server Error');
  });

  it('should handle generic network errors', async () => {
    const networkError = new Error('Network failed');
    axios.get.mockRejectedValue(networkError);

    await expect(handler({ args: validBaseArgs, auth: validAuth })).rejects.toThrow('Network failed');
  });

  const expectZodError = async (args, auth, expectedMessagePart, isExact = false) => {
    try {
      await handler({ args, auth });
      throw new Error('Handler did not throw expected ZodError');
    } catch (error) {
      expect(error.name).toBe('ZodError');
      const foundError = error.errors.find(e => isExact ? e.message === expectedMessagePart : e.message.includes(expectedMessagePart));
      expect(foundError).toBeDefined();
    }
  };

  describe('Schema Validation', () => {
    it('should throw validation error if baseUrl is missing from auth', async () => {
      const invalidAuth = { consumerKey: mockConsumerKey, consumerSecret: mockConsumerSecret };
      await expectZodError(validBaseArgs, invalidAuth, "Required", true);
    });

    it('should throw validation error if baseUrl is invalid in auth', async () => {
      const invalidAuth = { ...validAuth, baseUrl: 'not-a-url' };
      await expectZodError(validBaseArgs, invalidAuth, "WooCommerce base URL is required.");
    });

    it('should throw validation error if consumerKey is missing from auth', async () => {
      const invalidAuth = { baseUrl: mockBaseUrl, consumerSecret: mockConsumerSecret };
      await expectZodError(validBaseArgs, invalidAuth, "Required", true);
    });

    it('should throw validation error if consumerKey is an empty string in auth', async () => {
      const invalidAuth = { ...validAuth, consumerKey: "" };
      await expectZodError(validBaseArgs, invalidAuth, "WooCommerce Consumer Key is required.");
    });

    it('should throw validation error if consumerSecret is missing from auth', async () => {
      const invalidAuth = { baseUrl: mockBaseUrl, consumerKey: mockConsumerKey };
      await expectZodError(validBaseArgs, invalidAuth, "Required", true);
    });

    it('should throw validation error if consumerSecret is an empty string in auth', async () => {
      const invalidAuth = { ...validAuth, consumerSecret: "" };
      await expectZodError(validBaseArgs, invalidAuth, "WooCommerce Consumer Secret is required.");
    });

    it('should throw validation error if orderId is missing from args', async () => {
      // For a missing field that is a union, Zod often defaults to "Invalid input"
      await expectZodError(emptyArgs, validAuth, "Invalid input", false);
    });

    it('should throw validation error if orderId is not a positive integer (e.g. 0) in args', async () => {
      const invalidArgs = { orderId: 0 };
       await expectZodError(invalidArgs, validAuth, "Order ID must be a positive integer");
    });

    it('should throw validation error if orderId is an empty string in args', async () => {
      const invalidArgs = { orderId: "" };
       await expectZodError(invalidArgs, validAuth, "Order ID cannot be empty if a string");
    });
  });
});
