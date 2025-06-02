// handlers/woocommerce/getOrderById.test.js
const { handler, ArgsSchema } = require('./getOrderById');
const axios = require('axios');

jest.mock('axios');

const mockBaseUrl = 'https://teststore.com';
const mockConsumerKey = 'ck_test_key';
const mockConsumerSecret = 'cs_test_secret';
const mockOrderId = 123;

describe('WooCommerce getOrderById Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  const validArgs = {
    baseUrl: mockBaseUrl,
    consumerKey: mockConsumerKey,
    consumerSecret: mockConsumerSecret,
    orderId: mockOrderId,
  };

  it('should fetch an order by ID with basic auth', async () => {
    const mockOrder = { id: mockOrderId, total: '150', currency: 'USD' };
    axios.get.mockResolvedValue({ data: mockOrder });

    const result = await handler({ args: validArgs });

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

  it('should handle order not found (404) specifically', async () => {
    const apiError = new Error('Request failed with status code 404');
    apiError.response = {
      status: 404,
      data: { code: 'woocommerce_rest_shop_order_invalid_id', message: 'Invalid ID.', data: { status: 404 } }
    };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: validArgs })).rejects.toThrow(`Order ${mockOrderId} not found: Invalid ID.`);
  });

  it('should handle other API errors from WooCommerce', async () => {
    const apiError = new Error('WooCommerce API Error');
    apiError.response = { status: 500, data: { message: 'Internal Server Error' } };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: validArgs })).rejects.toThrow('Internal Server Error');
  });

  it('should handle generic network errors', async () => {
    const networkError = new Error('Network failed');
    axios.get.mockRejectedValue(networkError);

    await expect(handler({ args: validArgs })).rejects.toThrow('Network failed');
  });

  it('should accept string orderId', async () => {
    const stringOrderId = "order_abc123";
    const argsWithStringOrderId = { ...validArgs, orderId: stringOrderId };
    const mockOrder = { id: stringOrderId, total: '150', currency: 'USD' };
    axios.get.mockResolvedValue({ data: mockOrder });

    const result = await handler({ args: argsWithStringOrderId });
     expect(axios.get).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wc/v3/orders/${stringOrderId}`,
      expect.any(Object)
    );
    expect(result).toEqual(mockOrder);
  });

  // Helper to test Zod validation errors by checking if the error message includes a specific substring
  const expectZodErrorContaining = async (args, expectedMessagePart) => {
    try {
      await handler({ args });
      throw new Error('Handler did not throw expected ZodError');
    } catch (error) {
      expect(error.name).toBe('ZodError');
      const foundError = error.errors.find(e => e.message.includes(expectedMessagePart));
      expect(foundError).toBeDefined();
    }
  };

  // Helper to test Zod validation errors by checking for an exact message match
  const expectZodErrorExact = async (args, expectedMessage) => {
    try {
      await handler({ args });
      throw new Error('Handler did not throw expected ZodError');
    } catch (error) {
      expect(error.name).toBe('ZodError');
      const foundError = error.errors.find(e => e.message === expectedMessage);
      expect(foundError).toBeDefined();
    }
  };


  describe('ArgsSchema Validation', () => {
    it('should throw validation error if baseUrl is missing', async () => {
      const { baseUrl, ...incompleteArgs } = validArgs;
      await expectZodErrorExact(incompleteArgs, "Required");
    });

    it('should throw validation error if baseUrl is invalid', async () => {
      const invalidArgs = { ...validArgs, baseUrl: 'not-a-url' };
      await expectZodErrorContaining(invalidArgs, "Invalid WooCommerce base URL");
    });

    it('should throw validation error if consumerKey is missing', async () => {
      const { consumerKey, ...incompleteArgs } = validArgs;
      await expectZodErrorExact(incompleteArgs, "Required");
    });

    it('should throw validation error if consumerKey is an empty string', async () => {
      const invalidArgs = { ...validArgs, consumerKey: "" };
      await expectZodErrorContaining(invalidArgs, "WooCommerce Consumer Key is required");
    });

    it('should throw validation error if consumerSecret is missing', async () => {
      const { consumerSecret, ...incompleteArgs } = validArgs;
      await expectZodErrorExact(incompleteArgs, "Required");
    });

    it('should throw validation error if consumerSecret is an empty string', async () => {
      const invalidArgs = { ...validArgs, consumerSecret: "" };
      await expectZodErrorContaining(invalidArgs, "WooCommerce Consumer Secret is required");
    });

    it('should throw validation error if orderId is missing', async () => {
      const { orderId, ...incompleteArgs } = validArgs;
      // For a missing field that is a union, Zod often defaults to "Invalid input" or a similar generic message
      // if "Required" isn't explicitly part of the union's error mapping for undefined.
      await expectZodErrorContaining(incompleteArgs, "Invalid input");
    });

    it('should throw validation error if orderId is not a positive integer (e.g. 0)', async () => {
      const invalidArgs = { ...validArgs, orderId: 0 };
       await expectZodErrorContaining(invalidArgs, "Order ID must be a positive integer");
    });

    it('should throw validation error if orderId is an empty string', async () => {
      const invalidArgs = { ...validArgs, orderId: "" };
       await expectZodErrorContaining(invalidArgs, "Order ID cannot be empty if a string");
    });
  });
});
