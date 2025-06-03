// handlers/woocommerce/getCustomers.test.js
const { handler, ArgsSchema, ConnectionSchema } = require('./getCustomers'); // Import ConnectionSchema
const axios = require('axios');

jest.mock('axios');

const mockBaseUrl = 'https://teststore.com';
const mockConsumerKey = 'ck_test_key';
const mockConsumerSecret = 'cs_test_secret';

describe('WooCommerce getCustomers Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  const validAuth = {
    baseUrl: mockBaseUrl,
    consumerKey: mockConsumerKey,
    consumerSecret: mockConsumerSecret
  };
  const emptyArgs = {};

  it('should fetch customers with basic auth and no filters', async () => {
    const mockCustomers = [{ id: 1, email: 'customer1@example.com' }, { id: 2, email: 'customer2@example.com' }];
    axios.get.mockResolvedValue({ data: mockCustomers });

    const result = await handler({ args: emptyArgs, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wc/v3/customers`,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${mockConsumerKey}:${mockConsumerSecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        params: {},
      }
    );
    expect(result).toEqual(mockCustomers);
  });

  it('should fetch customers with email filter', async () => {
    const customerEmail = 'test@example.com';
    const argsWithEmail = { email: customerEmail };
    axios.get.mockResolvedValue({ data: [{ id: 1, email: customerEmail }] });

    await handler({ args: argsWithEmail, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: { email: customerEmail },
      })
    );
  });

  it('should fetch customers with search filter', async () => {
    const searchTerm = 'JohnDoe';
    const argsWithSearch = { search: searchTerm };
    axios.get.mockResolvedValue({ data: [{ id: 2, first_name: 'John' }] });

    await handler({ args: argsWithSearch, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: { search: searchTerm },
      })
    );
  });

  it('should fetch customers with both email and search filters', async () => {
    const customerEmail = 'test@example.com';
    const searchTerm = 'Testy';
    const argsWithFilters = { email: customerEmail, search: searchTerm };
    axios.get.mockResolvedValue({ data: [{ id: 2, email: customerEmail, first_name: 'Testy' }] });

    await handler({ args: argsWithFilters, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: { email: customerEmail, search: searchTerm },
      })
    );
  });

  it('should handle API errors from WooCommerce', async () => {
    const apiError = new Error('WooCommerce API Error');
    apiError.response = { data: { message: 'Invalid parameter(s): some_parameter' } };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: emptyArgs, auth: validAuth })).rejects.toThrow('Invalid parameter(s): some_parameter');
  });

  it('should handle generic network errors', async () => {
    const networkError = new Error('Network connection failed');
    axios.get.mockRejectedValue(networkError);

    await expect(handler({ args: emptyArgs, auth: validAuth })).rejects.toThrow('Network connection failed');
  });

  describe('Schema Validation', () => {
    const expectZodError = async (args, auth, expectedMessagePart, isExact = false) => {
      try {
        await handler({ args, auth });
        throw new Error('Handler did not throw ZodError');
      } catch (error) {
        expect(error.name).toBe('ZodError');
        const foundError = error.errors.find(e => isExact ? e.message === expectedMessagePart : e.message.includes(expectedMessagePart));
        expect(foundError).toBeDefined();
      }
    };

    // ConnectionSchema tests (auth object)
    it('should throw validation error if baseUrl is missing from auth', async () => {
      const invalidAuth = { consumerKey: mockConsumerKey, consumerSecret: mockConsumerSecret };
      await expectZodError(emptyArgs, invalidAuth, "Required", true);
    });

    it('should throw validation error if baseUrl is invalid in auth', async () => {
      const invalidAuth = { ...validAuth, baseUrl: 'not-a-valid-url' };
      await expectZodError(emptyArgs, invalidAuth, "WooCommerce base URL is required."); // Custom message
    });

    it('should throw validation error if consumerKey is missing from auth', async () => {
      const invalidAuth = { baseUrl: mockBaseUrl, consumerSecret: mockConsumerSecret };
      await expectZodError(emptyArgs, invalidAuth, "Required", true);
    });

    it('should throw validation error if consumerKey is an empty string in auth', async () => {
      const invalidAuth = { ...validAuth, consumerKey: "" };
      await expectZodError(emptyArgs, invalidAuth, "WooCommerce Consumer Key is required."); // Custom message
    });

    it('should throw validation error if consumerSecret is missing from auth', async () => {
      const invalidAuth = { baseUrl: mockBaseUrl, consumerKey: mockConsumerKey };
      await expectZodError(emptyArgs, invalidAuth, "Required", true);
    });

    it('should throw validation error if consumerSecret is an empty string in auth', async () => {
      const invalidAuth = { ...validAuth, consumerSecret: "" };
      await expectZodError(emptyArgs, invalidAuth, "WooCommerce Consumer Secret is required."); // Custom message
    });

    // ArgsSchema tests (args object)
    it('should throw validation error if email is provided but invalid in args', async () => {
      const invalidArgs = { email: 'not-an-email' };
      await expectZodError(invalidArgs, validAuth, "Invalid email format");
    });

    it('should accept valid email in args', async () => {
      const argsWithValidEmail = { email: 'valid@example.com' };
      axios.get.mockResolvedValue({ data: [] });
      await expect(handler({ args: argsWithValidEmail, auth: validAuth })).resolves.not.toThrow();
    });

    it('should accept empty search string in args (and not pass it as param if handler logic omits falsy)', async () => {
      const argsWithEmptySearch = { search: '' };
      axios.get.mockResolvedValue({ data: [] });
      await expect(handler({ args: argsWithEmptySearch, auth: validAuth })).resolves.not.toThrow();
      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: {}, // Empty search string is falsy, so 'search' param is omitted by handler
        })
      );
    });
  });
});
