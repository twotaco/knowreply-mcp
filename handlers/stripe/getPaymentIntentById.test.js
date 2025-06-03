// handlers/stripe/getPaymentIntentById.test.js
const { handler, ArgsSchema, ConnectionSchema } = require('./getPaymentIntentById'); // Updated to import ConnectionSchema
const axios = require('axios');

jest.mock('axios');

const mockApiKey = 'sk_test_yourstripesecretkey';
const mockPaymentIntentId = 'pi_testpaymentintent123';

describe('Stripe getPaymentIntentById Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  const validArgs = { paymentIntentId: mockPaymentIntentId };
  const validAuth = { token: mockApiKey }; // This structure is compatible with the new ConnectionSchema

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
        params: {},
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
    networkError.request = {};
    axios.get.mockRejectedValue(networkError);

    await expect(handler({ args: validArgs, auth: validAuth }))
      .rejects.toThrow(`No response received from Stripe API when fetching Payment Intent ${mockPaymentIntentId}. Check network connectivity.`);
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
    it('should throw Zod error if paymentIntentId is missing in args', async () => {
      await expectZodError({}, validAuth, "Required", true);
    });

    it('should throw Zod error if paymentIntentId is an empty string in args', async () => {
      await expectZodError({ paymentIntentId: '' }, validAuth, "Stripe Payment Intent ID is required.");
    });

    it('should throw Zod error if token is missing in auth', async () => {
      await expectZodError(validArgs, {}, "Required", true);
    });

    it('should throw Zod error if token is an empty string in auth', async () => {
      await expectZodError(validArgs, { token: "" }, "Stripe API key (secret key) is required.");
    });
  });
});
