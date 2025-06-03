// handlers/woocommerce/getOrders.test.js
const { handler, ArgsSchema, ConnectionSchema } = require('./getOrders'); // Import ConnectionSchema
const axios = require('axios');

jest.mock('axios');

const mockBaseUrl = 'https://teststore.com';
const mockConsumerKey = 'ck_test_key';
const mockConsumerSecret = 'cs_test_secret';

describe('WooCommerce getOrders Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  // Define validAuth and emptyArgs for reuse
  const validAuth = {
    baseUrl: mockBaseUrl,
    consumerKey: mockConsumerKey,
    consumerSecret: mockConsumerSecret
  };
  const emptyArgs = {}; // For calls with no specific filters

  it('should fetch orders with basic auth and no filters', async () => {
    const mockOrders = [{ id: 1, total: '100' }, { id: 2, total: '200' }];
    axios.get.mockResolvedValue({ data: mockOrders });

    const result = await handler({ args: emptyArgs, auth: validAuth });

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
    const argsWithEmail = { email: 'test@example.com' };
    axios.get.mockResolvedValue({ data: [{ id: 1, customer_id: 5 }] });

    await handler({ args: argsWithEmail, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: { email: 'test@example.com' },
      })
    );
  });

  it('should fetch orders with customer ID filter', async () => {
    const argsWithCustomerId = { customerId: 123 };
    axios.get.mockResolvedValue({ data: [{ id: 1, customer_id: 123 }] });

    await handler({ args: argsWithCustomerId, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: { customer: 123 },
      })
    );
  });

  it('should fetch orders with status and search filters', async () => {
    const argsWithFilters = { status: 'processing', search: 'Order123' };
    axios.get.mockResolvedValue({ data: [{ id: 2, status: 'processing' }] });

    await handler({ args: argsWithFilters, auth: validAuth });

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

    await expect(handler({ args: emptyArgs, auth: validAuth })).rejects.toThrow('Invalid request');
  });

  it('should handle generic network errors', async () => {
    const networkError = new Error('Network failed');
    axios.get.mockRejectedValue(networkError);

    await expect(handler({ args: emptyArgs, auth: validAuth })).rejects.toThrow('Network failed');
  });

  describe('Schema Validation (ArgsSchema and ConnectionSchema)', () => {
    const expectZodError = async (args, auth, expectedMessagePart) => {
      try {
        await handler({ args, auth });
        throw new Error('Handler did not throw expected ZodError');
      } catch (error) {
        expect(error.name).toBe('ZodError');
        const foundError = error.errors.find(e => e.message.includes(expectedMessagePart));
        expect(foundError).toBeDefined();
      }
    };

    // Tests for ConnectionSchema (auth object)
    it('should throw validation error if baseUrl is missing from auth', async () => {
      const invalidAuth = { consumerKey: mockConsumerKey, consumerSecret: mockConsumerSecret };
      await expectZodError(emptyArgs, invalidAuth, "Required"); // Zod default for missing
    });

    it('should throw validation error if baseUrl is invalid in auth', async () => {
      const invalidAuth = { ...validAuth, baseUrl: 'not-a-url' };
      await expectZodError(emptyArgs, invalidAuth, "WooCommerce base URL is required."); // Custom message from schema
    });

    it('should throw validation error if consumerKey is missing from auth', async () => {
      const invalidAuth = { baseUrl: mockBaseUrl, consumerSecret: mockConsumerSecret };
      await expectZodError(emptyArgs, invalidAuth, "Required"); // Zod default for missing
    });

    it('should throw validation error if consumerKey is empty string in auth', async () => {
      const invalidAuth = { ...validAuth, consumerKey: "" };
      await expectZodError(emptyArgs, invalidAuth, "WooCommerce Consumer Key is required."); // Custom message
    });

    it('should throw validation error if consumerSecret is missing from auth', async () => {
      const invalidAuth = { baseUrl: mockBaseUrl, consumerKey: mockConsumerKey };
      await expectZodError(emptyArgs, invalidAuth, "Required"); // Zod default for missing
    });

    it('should throw validation error if consumerSecret is empty string in auth', async () => {
      const invalidAuth = { ...validAuth, consumerSecret: "" };
      await expectZodError(emptyArgs, invalidAuth, "WooCommerce Consumer Secret is required."); // Custom message
    });

    // Tests for ArgsSchema (args object)
    it('should throw validation error if email is invalid in args', async () => {
      const invalidArgs = { email: 'not-an-email' };
      await expectZodError(invalidArgs, validAuth, "Invalid email format.");
    });

    it('should accept valid args (e.g. all optional filters present and valid)', async () => {
        const fullValidArgs = {
            email: 'test@example.com',
            status: 'completed',
            search: 'TestOrder',
            customerId: 123
        };
        axios.get.mockResolvedValue({data: []}); // Mock API success
        await expect(handler({ args: fullValidArgs, auth: validAuth })).resolves.not.toThrow();
    });

    it('should throw Zod error for invalid customerId type in args (e.g. boolean)', async () => {
        const invalidArgs = { customerId: true };
        await expectZodError(invalidArgs, validAuth, "Invalid input"); // Zod default for union mismatch
    });

    it('should throw Zod error for empty string customerId in args', async () => {
        const invalidArgs = { customerId: "" };
        await expectZodError(invalidArgs, validAuth, "String must contain at least 1 character");
    });
  });
});
