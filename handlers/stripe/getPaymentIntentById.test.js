// handlers/stripe/getPaymentIntentById.test.js
const { handler, ArgsSchema, AuthSchema } = require('./getPaymentIntentById');
const axios = require('axios');

jest.mock('axios');

const mockApiKey = 'sk_test_yourstripesecretkey';
const mockPaymentIntentId = 'pi_testpaymentintent123';

describe('Stripe getPaymentIntentById Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  const validArgs = { paymentIntentId: mockPaymentIntentId };
  const validAuth = { token: mockApiKey };

  it('should fetch a PaymentIntent by ID successfully', async () => {
    const stripePaymentIntentResponse = {
      id: mockPaymentIntentId,
      object: 'payment_intent',
      amount: 2000,
      currency: 'usd',
      status: 'succeeded',
      // ... other Stripe PaymentIntent fields
    };
    axios.get.mockResolvedValue({ data: stripePaymentIntentResponse });

    const result = await handler({ args: validArgs, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      `https://api.stripe.com/v1/payment_intents/${mockPaymentIntentId}`,
      {
        params: {}, // No expand params in this test
        headers: { 'Authorization': `Bearer ${mockApiKey}` },
      }
    );
    expect(result).toEqual(stripePaymentIntentResponse);
  });

  it('should throw a specific error if PaymentIntent not found (404)', async () => {
    const apiError = new Error('Request failed with status code 404');
    apiError.response = {
      status: 404,
      data: { error: { type: 'invalid_request_error', message: `No such payment_intent: '${mockPaymentIntentId}'` } }
    };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: validArgs, auth: validAuth })).rejects.toThrow(`Stripe Payment Intent with ID '${mockPaymentIntentId}' not found.`);
  });

  it('should throw an error if Stripe API call fails with other errors', async () => {
    const apiError = new Error('Stripe API Error');
    apiError.response = { data: { error: { message: 'Authentication required.' } } };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: validArgs, auth: validAuth })).rejects.toThrow('Stripe API Error: Authentication required.');
  });

  it('should throw an error if Stripe API returns non-2xx without specific error.message in data.error', async () => {
    const apiError = new Error('Request failed with status code 503');
    apiError.response = { status: 503, statusText: 'Service Unavailable', data: {} }; // No data.error.message
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: validArgs, auth: validAuth })).rejects.toThrow('Stripe API Error: Service Unavailable');
  });

  it('should throw an error if no response received from Stripe API', async () => {
    const networkError = new Error('Network problem');
    networkError.request = {}; // Indicates a request was made
    axios.get.mockRejectedValue(networkError);

    await expect(handler({ args: validArgs, auth: validAuth }))
      .rejects.toThrow(`No response received from Stripe API when fetching Payment Intent ${mockPaymentIntentId}. Check network connectivity.`);
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
    it('should throw Zod error if paymentIntentId is missing in args', async () => {
      // ArgsSchema expects 'paymentIntentId'. If args is {}, paymentIntentId is missing.
      await expectZodError({}, validAuth, "Required");
    });

    it('should throw Zod error if paymentIntentId is an empty string in args', async () => {
      // ArgsSchema has .min(1) for paymentIntentId.
      await expectZodError({ paymentIntentId: '' }, validAuth, "Stripe Payment Intent ID is required.");
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
