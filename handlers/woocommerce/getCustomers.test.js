// handlers/woocommerce/getCustomers.test.js
const { handler, ArgsSchema } = require('./getCustomers');
const axios = require('axios');

jest.mock('axios');

const mockBaseUrl = 'https://teststore.com';
const mockConsumerKey = 'ck_test_key';
const mockConsumerSecret = 'cs_test_secret';

describe('WooCommerce getCustomers Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  const validArgs = {
    baseUrl: mockBaseUrl,
    consumerKey: mockConsumerKey,
    consumerSecret: mockConsumerSecret,
  };

  it('should fetch customers with basic auth and no filters', async () => {
    const mockCustomers = [{ id: 1, email: 'customer1@example.com' }, { id: 2, email: 'customer2@example.com' }];
    axios.get.mockResolvedValue({ data: mockCustomers });

    const result = await handler({ args: validArgs });

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
    const argsWithEmail = { ...validArgs, email: customerEmail };
    axios.get.mockResolvedValue({ data: [{ id: 1, email: customerEmail }] });

    await handler({ args: argsWithEmail });

    expect(axios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: { email: customerEmail },
      })
    );
  });

  it('should fetch customers with search filter', async () => {
    const searchTerm = 'JohnDoe';
    const argsWithSearch = { ...validArgs, search: searchTerm };
    axios.get.mockResolvedValue({ data: [{ id: 2, first_name: 'John' }] });

    await handler({ args: argsWithSearch });

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
    const argsWithFilters = { ...validArgs, email: customerEmail, search: searchTerm };
    axios.get.mockResolvedValue({ data: [{ id: 2, email: customerEmail, first_name: 'Testy' }] });

    await handler({ args: argsWithFilters });

    expect(axios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: { email: customerEmail, search: searchTerm },
      })
    );
  });


  it('should handle API errors from WooCommerce', async () => {
    const apiError = new Error('WooCommerce API Error');
    // This message suggests the API itself rejected a parameter.
    // Ensure args passed to handler are valid as per Zod schema for this test.
    apiError.response = { data: { message: 'Invalid parameter(s): some_parameter' } };
    axios.get.mockRejectedValue(apiError);

    // Pass validArgs or args that would pass Zod but cause an API error.
    // If the error message is generic, validArgs is fine.
    // If it's specific to a parameter (like email), pass a valid email.
    const argsForApiErrorTest = { ...validArgs, email: 'apierror@example.com' };

    await expect(handler({ args: argsForApiErrorTest })).rejects.toThrow('Invalid parameter(s): some_parameter');
  });

  it('should handle generic network errors', async () => {
    const networkError = new Error('Network connection failed');
    axios.get.mockRejectedValue(networkError);

    await expect(handler({ args: validArgs })).rejects.toThrow('Network connection failed');
  });

  describe('ArgsSchema Validation', () => {
    const expectZodError = async (args, expectedMessagePart) => {
      try {
        await handler({ args });
        throw new Error('Handler did not throw ZodError');
      } catch (error) {
        expect(error.name).toBe('ZodError');
        expect(error.errors.some(e => e.message.includes(expectedMessagePart))).toBe(true);
      }
    };

    ['baseUrl', 'consumerKey', 'consumerSecret'].forEach(field => {
      it(`should throw validation error if ${field} is missing`, async () => {
        const incompleteArgs = { ...validArgs };
        delete incompleteArgs[field];
        await expectZodError(incompleteArgs, "Required");
      });
    });

    it('should throw validation error if baseUrl is invalid', async () => {
      const invalidArgs = { ...validArgs, baseUrl: 'not-a-valid-url' };
      await expectZodError(invalidArgs, "Invalid WooCommerce base URL");
    });

    ['consumerKey', 'consumerSecret'].forEach(field => {
         it(`should throw validation error if ${field} is an empty string`, async () => {
            const invalidArgs = { ...validArgs, [field]: "" };
            const customMessage = field === 'consumerKey' ? "WooCommerce Consumer Key is required" : "WooCommerce Consumer Secret is required";
            await expectZodError(invalidArgs, customMessage);
        });
    });

    it('should throw validation error if email is provided but invalid', async () => {
      const invalidArgs = { ...validArgs, email: 'not-an-email' };
      await expectZodError(invalidArgs, "Invalid email format");
    });

    it('should accept valid email', async () => {
      const argsWithValidEmail = { ...validArgs, email: 'valid@example.com' };
      axios.get.mockResolvedValue({ data: [] });
      await expect(handler({ args: argsWithValidEmail })).resolves.not.toThrow();
    });

    it('should accept empty search string and not pass it as a param', async () => {
      const argsWithEmptySearch = { ...validArgs, search: '' };
      axios.get.mockResolvedValue({ data: [] });
      await expect(handler({ args: argsWithEmptySearch })).resolves.not.toThrow();
       expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          params: {}, // Empty search string is falsy, so 'search' param is omitted by handler
        })
      );
    });
  });
});
