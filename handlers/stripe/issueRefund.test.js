// handlers/stripe/issueRefund.test.js
const { handler, ArgsSchema, ConnectionSchema } = require('./issueRefund');
const axios = require('axios');
const qs = require('qs');

jest.mock('axios');

const mockApiKey = 'sk_test_yourstripesecretkey';
const mockChargeId = 'ch_testchargeid123';

describe('Stripe issueRefund Handler', () => {
  beforeEach(() => {
    axios.post.mockReset();
  });

  const validAuth = { token: mockApiKey };

  it('should issue a full refund successfully when no amount is provided', async () => {
    const validArgs = { chargeId: mockChargeId };
    const mockRefundResponse = {
      id: 're_123',
      amount: 1000, // Assuming original charge was 1000 cents
      charge: mockChargeId,
      currency: 'usd',
      status: 'succeeded',
      reason: null,
      created: 1700000000,
    };
    axios.post.mockResolvedValue({ data: mockRefundResponse });

    const result = await handler({ args: validArgs, auth: validAuth });

    const expectedBody = qs.stringify({ charge: mockChargeId });
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/refunds',
      expectedBody,
      {
        headers: {
          'Authorization': `Bearer ${mockApiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
      }
    );
    expect(result).toEqual({
      id: 're_123',
      amount: 1000,
      charge: mockChargeId,
      currency: 'usd',
      status: 'succeeded',
      reason: null,
      created: new Date(1700000000 * 1000).toISOString(),
    });
  });

  it('should issue a partial refund successfully when amount and reason are provided', async () => {
    const partialAmount = 500; // 500 cents
    const reason = 'requested_by_customer';
    const validArgsWithAmountAndReason = { chargeId: mockChargeId, amount: partialAmount, reason: reason };
    const mockRefundResponse = {
      id: 're_124',
      amount: partialAmount,
      charge: mockChargeId,
      currency: 'usd',
      status: 'succeeded',
      reason: reason,
      created: 1700000100,
    };
    axios.post.mockResolvedValue({ data: mockRefundResponse });

    const result = await handler({ args: validArgsWithAmountAndReason, auth: validAuth });

    const expectedBody = qs.stringify({ charge: mockChargeId, amount: partialAmount, reason: reason });
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/refunds',
      expectedBody,
      expect.objectContaining({
        headers: {
          'Authorization': `Bearer ${mockApiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })
    );
    expect(result).toEqual({
      id: 're_124',
      amount: partialAmount,
      charge: mockChargeId,
      currency: 'usd',
      status: 'succeeded',
      reason: reason,
      created: new Date(1700000100 * 1000).toISOString(),
    });
  });

  it('should throw an error if Stripe API call fails (e.g., charge already refunded)', async () => {
    const validArgs = { chargeId: mockChargeId };
    const apiError = new Error('Stripe API Error');
    apiError.response = { data: { error: { message: 'The charge ch_testchargeid123 has already been fully refunded.' } } };
    axios.post.mockRejectedValue(apiError);
    await expect(handler({ args: validArgs, auth: validAuth })).rejects.toThrow('Stripe API Error: The charge ch_testchargeid123 has already been fully refunded.');
  });

  it('should throw an error if no response received from Stripe API', async () => {
    const validArgs = { chargeId: mockChargeId };
    const networkError = new Error('Network timeout');
    networkError.request = {};
    axios.post.mockRejectedValue(networkError);
    await expect(handler({ args: validArgs, auth: validAuth }))
      .rejects.toThrow(`No response received from Stripe API when trying to issue refund for charge ${mockChargeId}. Check network connectivity.`);
  });

  const expectZodError = async (args, auth, expectedMessagePart, isExact = false) => {
      try {
          await handler({ args, auth });
          throw new Error('Handler did not throw an error as expected.');
      } catch (error) {
          expect(error.name).toBe('ZodError');
          const foundError = error.errors.find(e => isExact ? e.message === expectedMessagePart : e.message.includes(expectedMessagePart));
          expect(foundError).toBeDefined();
      }
  };

  describe('Schema Validation', () => {
    // ArgsSchema tests
    it('should throw Zod error if chargeId is missing in args', async () => {
      await expectZodError({}, validAuth, "Required", true);
    });
    it('should throw Zod error if chargeId is an empty string in args', async () => {
      await expectZodError({ chargeId: '' }, validAuth, "Charge ID cannot be empty.", true);
    });
    it('should throw Zod error if amount is not a positive number', async () => {
      await expectZodError({ chargeId: mockChargeId, amount: -100 }, validAuth, "Amount must be a positive number");
    });
    it('should throw Zod error if amount is not an integer', async () => {
      await expectZodError({ chargeId: mockChargeId, amount: 100.50 }, validAuth, "Amount must be an integer (cents)");
    });
    it('should throw Zod error if reason is an invalid enum value', async () => {
      await expectZodError({ chargeId: mockChargeId, reason: 'other_reason' }, validAuth, "Invalid enum value. Expected 'duplicate' | 'fraudulent' | 'requested_by_customer'");
    });
    it('should accept valid reason enum value', async () => {
      axios.post.mockResolvedValue({ data: { id:'re_valid', amount:100, charge: mockChargeId, currency:'usd', status:'succeeded', created: Date.now()/1000 } });
      await expect(handler({ args: {chargeId: mockChargeId, reason: 'duplicate'}, auth: validAuth })).resolves.toBeDefined();
    });

    // ConnectionSchema tests
    it('should throw Zod error if token is missing in auth', async () => {
      await expectZodError({ chargeId: mockChargeId }, {}, "Required", true);
    });
    it('should throw Zod error if token is an empty string in auth', async () => {
      await expectZodError({ chargeId: mockChargeId }, { token: "" }, "Stripe API key (secret key) is required.", true);
    });
  });
});
