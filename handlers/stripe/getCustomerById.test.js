// handlers/stripe/getCustomerById.test.js
const { handler, ArgsSchema, AuthSchema } = require('./getCustomerById');
const axios = require('axios');

jest.mock('axios');

const mockApiKey = 'sk_test_yourstripesecretkey';
const mockCustomerId = 'cus_testcustomerid123';

describe('Stripe getCustomerById Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  const validArgs = { customerId: mockCustomerId };
  const validAuth = { token: mockApiKey };

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
        params: {}, // No expand params in this test
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
    apiError.response = { status: 500, statusText: 'Server Error', data: {} }; // No data.error.message
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: validArgs, auth: validAuth })).rejects.toThrow('Stripe API Error: Server Error');
  });

  it('should throw an error if no response received from Stripe API', async () => {
    const networkError = new Error('Network issue');
    networkError.request = {}; // Indicates a request was made
    axios.get.mockRejectedValue(networkError);
    
    await expect(handler({ args: validArgs, auth: validAuth }))
      .rejects.toThrow(`No response received from Stripe API when fetching customer ${mockCustomerId}. Check network connectivity.`);
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
    it('should throw Zod error if customerId is missing in args', async () => {
      // ArgsSchema expects 'customerId'. If args is {}, customerId is missing.
      await expectZodError({}, validAuth, "Required");
    });

    it('should throw Zod error if customerId is an empty string in args', async () => {
      // ArgsSchema has .min(1) for customerId.
      await expectZodError({ customerId: '' }, validAuth, "Stripe Customer ID is required.");
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
