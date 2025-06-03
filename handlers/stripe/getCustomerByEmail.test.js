// handlers/stripe/getCustomerByEmail.test.js
const { handler, ArgsSchema, ConnectionSchema } = require('./getCustomerByEmail'); // Updated to import ConnectionSchema
const axios = require('axios');

jest.mock('axios');

const mockApiKey = 'sk_test_yourstripesecretkey';

describe('Stripe getCustomerByEmail Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  const validArgs = { email: 'test@example.com' };
  const validAuth = { token: mockApiKey }; // This structure is compatible with the new ConnectionSchema

  it('should fetch a customer by email successfully', async () => {
    const stripeCustomer = {
      id: 'cus_123',
      name: 'Test User',
      email: 'test@example.com',
      phone: null,
      created: 1678886400,
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
    apiError.response = { status: 500, statusText: 'Internal Server Error', data: {} };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: validArgs, auth: validAuth })).rejects.toThrow('Stripe API Error: Internal Server Error');
  });


  it('should throw an error if no response received from Stripe API', async () => {
    const networkError = new Error('Network timeout');
    networkError.request = {};
    axios.get.mockRejectedValue(networkError);

    await expect(handler({ args: validArgs, auth: validAuth })).rejects.toThrow('No response received from Stripe API. Check network connectivity.');
  });

  const expectZodError = async (args, auth, expectedMessagePart, isExact = false) => { // Added isExact flag for flexibility
      try {
          await handler({ args, auth });
          throw new Error('Handler did not throw an error as expected.');
      } catch (error) {
          expect(error.name).toBe('ZodError');
          const foundError = error.errors.find(e => isExact ? e.message === expectedMessagePart : e.message.includes(expectedMessagePart));
          expect(foundError).toBeDefined();
      }
  };

  describe('ArgsSchema and ConnectionSchema Validation', () => { // Updated describe block name for clarity
    it('should throw Zod error if email is missing in args', async () => {
      await expectZodError({}, validAuth, "Required", true);
    });

    it('should throw Zod error if email is invalid in args', async () => {
      await expectZodError({ email: 'not-an-email' }, validAuth, "Invalid email format.");
    });

    it('should throw Zod error if token is missing in auth', async () => {
      await expectZodError(validArgs, {}, "Required", true);
    });

    it('should throw Zod error if token is an empty string in auth', async () => {
      await expectZodError(validArgs, { token: "" }, "Stripe API key (secret key) is required.");
    });
  });
});
