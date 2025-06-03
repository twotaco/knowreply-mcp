// handlers/stripe/getCustomerById.test.js
const { handler, ArgsSchema, ConnectionSchema } = require('./getCustomerById'); // Updated to import ConnectionSchema
const axios = require('axios');

jest.mock('axios');

const mockApiKey = 'sk_test_yourstripesecretkey';
const mockCustomerId = 'cus_testcustomerid123';

describe('Stripe getCustomerById Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  const validArgs = { customerId: mockCustomerId };
  const validAuth = { token: mockApiKey }; // This structure is compatible with the new ConnectionSchema

  it('should fetch a customer by ID successfully', async () => {
    const stripeCustomerResponse = {
      id: mockCustomerId,
      object: 'customer',
      email: 'customer@example.com',
      name: 'Test Customer',
      // ... other Stripe customer fields
    };
    axios.get.mockResolvedValue({ data: stripeCustomerResponse });

    const result = await handler({ args: validArgs, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      `https://api.stripe.com/v1/customers/${mockCustomerId}`,
      {
        params: {},
        headers: { 'Authorization': `Bearer ${mockApiKey}` },
      }
    );
    expect(result).toEqual(stripeCustomerResponse);
  });

  it('should throw a specific error if customer not found (404)', async () => {
    const apiError = new Error('Request failed with status code 404');
    apiError.response = {
      status: 404,
      data: { error: { type: 'invalid_request_error', message: `No such customer: '${mockCustomerId}'` } }
    };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: validArgs, auth: validAuth })).rejects.toThrow(`Stripe Customer with ID '${mockCustomerId}' not found.`);
  });

  it('should throw an error if Stripe API call fails with other errors', async () => {
    const apiError = new Error('Stripe API Error');
    apiError.response = { data: { error: { message: 'Invalid API Key provided.' } } };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: validArgs, auth: validAuth })).rejects.toThrow('Stripe API Error: Invalid API Key provided.');
  });

  it('should throw an error if Stripe API returns non-2xx without specific error.message in data.error', async () => {
    const apiError = new Error('Request failed with status code 500');
    apiError.response = { status: 500, statusText: 'Server Error', data: {} };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: validArgs, auth: validAuth })).rejects.toThrow('Stripe API Error: Server Error');
  });

  it('should throw an error if no response received from Stripe API', async () => {
    const networkError = new Error('Network issue');
    networkError.request = {};
    axios.get.mockRejectedValue(networkError);

    await expect(handler({ args: validArgs, auth: validAuth }))
      .rejects.toThrow(`No response received from Stripe API when fetching customer ${mockCustomerId}. Check network connectivity.`);
  });

  const expectZodError = async (args, auth, expectedMessagePart, isExact = false) => { // Added isExact flag
      try {
          await handler({ args, auth });
          throw new Error('Handler did not throw an error as expected.');
      } catch (error) {
          expect(error.name).toBe('ZodError');
          const foundError = error.errors.find(e => isExact ? e.message === expectedMessagePart : e.message.includes(expectedMessagePart));
          expect(foundError).toBeDefined();
      }
  };

  describe('ArgsSchema and ConnectionSchema Validation', () => { // Updated describe block name
    it('should throw Zod error if customerId is missing in args', async () => {
      await expectZodError({}, validAuth, "Required", true);
    });

    it('should throw Zod error if customerId is an empty string in args', async () => {
      await expectZodError({ customerId: '' }, validAuth, "Stripe Customer ID is required.");
    });

    it('should throw Zod error if token is missing in auth', async () => {
      await expectZodError(validArgs, {}, "Required", true);
    });

    it('should throw Zod error if token is an empty string in auth', async () => {
      await expectZodError(validArgs, { token: "" }, "Stripe API key (secret key) is required.");
    });
  });

  // Example for future 'expand' functionality test (currently commented out in handler)
  // it('should include expand parameters if provided', async () => {
  //   const argsWithExpand = { ...validArgs, expand: ['subscriptions', 'default_source'] };
  //   axios.get.mockResolvedValue({ data: { id: mockCustomerId, subscriptions: [], default_source: null } });
  //   await handler({ args: argsWithExpand, auth: validAuth });
  //   expect(axios.get).toHaveBeenCalledWith(
  //     `https://api.stripe.com/v1/customers/${mockCustomerId}`,
  //     {
  //       params: { expand: ['subscriptions', 'default_source'] },
  //       headers: { 'Authorization': `Bearer ${mockApiKey}` },
  //     }
  //   );
  // });
});
