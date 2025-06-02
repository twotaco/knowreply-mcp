// handlers/woocommerce/getOrders.test.js
const { handler, ArgsSchema } = require('./getOrders');
const axios = require('axios');

jest.mock('axios');

const mockBaseUrl = 'https://teststore.com';
const mockConsumerKey = 'ck_test_key';
const mockConsumerSecret = 'cs_test_secret';

describe('WooCommerce getOrders Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  const validArgs = {
    baseUrl: mockBaseUrl,
    consumerKey: mockConsumerKey,
    consumerSecret: mockConsumerSecret,
  };

  it('should fetch orders with basic auth and no filters', async () => {
    const mockOrders = [{ id: 1, total: '100' }, { id: 2, total: '200' }];
    axios.get.mockResolvedValue({ data: mockOrders });

    const result = await handler({ args: validArgs });

    expect(axios.get).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wc/v3/orders`,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${mockConsumerKey}:${mockConsumerSecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        params: {},
      }
    );
    expect(result).toEqual(mockOrders);
  });

  it('should fetch orders with email filter', async () => {
    const argsWithEmail = { ...validArgs, email: 'test@example.com' };
    axios.get.mockResolvedValue({ data: [{ id: 1, customer_id: 5 }] });

    await handler({ args: argsWithEmail });

    expect(axios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: { email: 'test@example.com' },
      })
    );
  });

  it('should fetch orders with customer ID filter', async () => {
    const argsWithCustomerId = { ...validArgs, customerId: 123 };
    axios.get.mockResolvedValue({ data: [{ id: 1, customer_id: 123 }] });

    await handler({ args: argsWithCustomerId });

    expect(axios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: { customer: 123 },
      })
    );
  });


  it('should fetch orders with status and search filters', async () => {
    const argsWithFilters = { ...validArgs, status: 'processing', search: 'Order123' };
    axios.get.mockResolvedValue({ data: [{ id: 2, status: 'processing' }] });

    await handler({ args: argsWithFilters });

    expect(axios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: { status: 'processing', search: 'Order123' },
      })
    );
  });

  it('should handle API errors from WooCommerce', async () => {
    const apiError = new Error('WooCommerce API Error');
    apiError.response = { data: { message: 'Invalid request' } };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: validArgs })).rejects.toThrow('Invalid request');
  });

  it('should handle generic network errors', async () => {
    const networkError = new Error('Network failed');
    axios.get.mockRejectedValue(networkError);

    await expect(handler({ args: validArgs })).rejects.toThrow('Network failed');
  });

  describe('ArgsSchema Validation', () => {
    const expectZodError = async (args, expectedMessagePart) => {
      try {
        await handler({ args });
        throw new Error('Handler did not throw expected ZodError');
      } catch (error) {
        expect(error.name).toBe('ZodError');
        const foundError = error.errors.find(e => e.message.includes(expectedMessagePart));
        expect(foundError).toBeDefined();
      }
    };

    it('should throw validation error if baseUrl is missing', async () => {
      const { baseUrl, ...incompleteArgs } = validArgs;
      await expectZodError(incompleteArgs, "Required");
    });

    it('should throw validation error if baseUrl is invalid', async () => {
      const invalidArgs = { ...validArgs, baseUrl: 'not-a-url' };
      await expectZodError(invalidArgs, "Invalid WooCommerce base URL");
    });

    it('should throw validation error if consumerKey is missing', async () => {
      const { consumerKey, ...incompleteArgs } = validArgs;
      // Custom message is for .min(1), for missing field it should be "Required"
      await expectZodError(incompleteArgs, "Required");
    });

    it('should throw validation error if consumerSecret is missing', async () => {
      const { consumerSecret, ...incompleteArgs } = validArgs;
      // Custom message is for .min(1), for missing field it should be "Required"
      await expectZodError(incompleteArgs, "Required");
    });

    it('should throw validation error if email is invalid', async () => {
      const invalidArgs = { ...validArgs, email: 'not-an-email' };
      await expectZodError(invalidArgs, "Invalid email");
    });
  });
});
