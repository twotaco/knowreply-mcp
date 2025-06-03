// handlers/stripe/getCustomerByEmail.test.js
const { handler, ArgsSchema, AuthSchema } = require('./getCustomerByEmail');
const axios = require('axios');

jest.mock('axios');

const mockApiKey = 'sk_test_yourstripesecretkey';

describe('Stripe getCustomerByEmail Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  const validArgs = { email: 'test@example.com' };
  const validAuth = { token: mockApiKey };

  it('should fetch a customer by email successfully', async () => {
    const stripeCustomer = {
      id: 'cus_123',
      name: 'Test User',
      email: 'test@example.com',
      phone: null,
      created: 1678886400, // Example timestamp
      currency: 'usd',
      livemode: false,
      metadata: {},
    };
    axios.get.mockResolvedValue({ data: { data: [stripeCustomer], object: 'list', has_more: false, url: '/v1/customers' } });

    const result = await handler({ args: validArgs, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/customers',
      {
        params: { email: 'test@example.com', limit: 1 },
        headers: { 'Authorization': `Bearer ${mockApiKey}` },
      }
    );
    expect(result).toEqual({
      id: 'cus_123',
      name: 'Test User',
      email: 'test@example.com',
      phone: null,
      created: 1678886400,
      currency: 'usd',
      livemode: false,
      metadata: {},
    });
  });

  it('should return null if no customer is found', async () => {
    axios.get.mockResolvedValue({ data: { data: [], object: 'list', has_more: false, url: '/v1/customers' } });

    const result = await handler({ args: validArgs, auth: validAuth });
    expect(result).toBeNull();
  });

  it('should throw an error if Stripe API call fails', async () => {
    const apiError = new Error('Stripe API Error');
    apiError.response = { data: { error: { message: 'Invalid API Key' } } };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: validArgs, auth: validAuth })).rejects.toThrow('Stripe API Error: Invalid API Key');
  });

  it('should throw an error if Stripe API returns non-2xx without specific error message in data.error.message', async () => {
    const apiError = new Error('Request failed with status code 500');
    apiError.response = { status: 500, statusText: 'Internal Server Error', data: {} }; // No error.message in data.error
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: validArgs, auth: validAuth })).rejects.toThrow('Stripe API Error: Internal Server Error');
  });


  it('should throw an error if no response received from Stripe API', async () => {
    const networkError = new Error('Network timeout');
    networkError.request = {}; // Indicates a request was made but no response
    axios.get.mockRejectedValue(networkError);

    await expect(handler({ args: validArgs, auth: validAuth })).rejects.toThrow('No response received from Stripe API. Check network connectivity.');
  });

  // Helper for Zod validation error checks
  const expectZodError = async (args, auth, expectedMessagePart) => {
      try {
          await handler({ args, auth });
          throw new Error('Handler did not throw an error as expected.');
      } catch (error) {
          expect(error.name).toBe('ZodError');
          const hasMatchingError = error.errors.some(err => err.message.includes(expectedMessagePart));
          expect(hasMatchingError).toBe(true);
      }
  };

  describe('ArgsSchema and AuthSchema Validation', () => {
    it('should throw Zod error if email is missing in args', async () => {
      // ArgsSchema expects 'email'. If args is {}, email is missing.
      await expectZodError({}, validAuth, "Required");
    });

    it('should throw Zod error if email is invalid in args', async () => {
      await expectZodError({ email: 'not-an-email' }, validAuth, "Invalid email format.");
    });

    it('should throw Zod error if token is missing in auth', async () => {
      // AuthSchema expects 'token'. If auth is {}, token is missing.
      await expectZodError(validArgs, {}, "Required");
    });

    it('should throw Zod error if token is an empty string in auth', async () => {
      // AuthSchema has .min(1) for token.
      await expectZodError(validArgs, { token: "" }, "Stripe API key (secret key) is required.");
    });
  });
});
