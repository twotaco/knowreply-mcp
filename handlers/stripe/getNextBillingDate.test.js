// handlers/stripe/getNextBillingDate.test.js
const { handler, ArgsSchema, ConnectionSchema } = require('./getNextBillingDate');
const axios = require('axios');

jest.mock('axios');

const mockApiKey = 'sk_test_yourstripesecretkey';
const mockCustomerId = 'cus_testcustomerid123';

describe('Stripe getNextBillingDate Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  const validArgs = { customerId: mockCustomerId };
  const validAuth = { token: mockApiKey };

  it('should fetch the next billing date for an active subscription', async () => {
    const mockSubscription = {
      id: 'sub_123',
      customer: mockCustomerId,
      current_period_end: 1700000000, // Example Unix timestamp
      status: 'active',
      plan: { id: 'plan_123', nickname: 'Test Plan' },
      trial_end: null,
    };
    axios.get.mockResolvedValue({ data: { data: [mockSubscription], object: 'list' } });

    const result = await handler({ args: validArgs, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/subscriptions',
      {
        params: { customer: mockCustomerId, status: 'active', limit: 1 },
        headers: { 'Authorization': `Bearer ${mockApiKey}` },
      }
    );
    expect(result).toEqual({
      customerId: mockCustomerId,
      subscriptionId: 'sub_123',
      nextBillingDate: new Date(1700000000 * 1000).toISOString(),
      planId: 'plan_123',
      planName: 'Test Plan',
      status: 'active',
      trialEndDate: null,
    });
  });

  it('should correctly format trialEndDate if present and test planName fallbacks', async () => {
    const mockTrialEndTimestamp = 1700500000;
    const mockSubscriptionWithTrial = {
      id: 'sub_124',
      customer: mockCustomerId,
      current_period_end: 1701000000,
      status: 'active',
      plan: { id: 'plan_124' /* product removed to test next fallback */ },
      items: { data: [{ plan: { nickname: 'Item Plan Nickname' }}]}, // Fallback from item's plan
      trial_end: mockTrialEndTimestamp,
    };
    axios.get.mockResolvedValue({ data: { data: [mockSubscriptionWithTrial], object: 'list' } });

    const result = await handler({ args: validArgs, auth: validAuth });
    expect(result.trialEndDate).toEqual(new Date(mockTrialEndTimestamp * 1000).toISOString());
    expect(result.planName).toEqual('Item Plan Nickname');
  });

  it('should use plan.product if plan.nickname and item plan nickname are not available', async () => {
    const mockSubscription = {
      id: 'sub_125',
      customer: mockCustomerId,
      current_period_end: 1700000000,
      status: 'active',
      plan: { id: 'plan_125', product: 'Product Name from Product Field' }, // No nickname
      items: { data: [{ plan: {} }] }, // No nickname on item's plan
      trial_end: null,
    };
    axios.get.mockResolvedValue({ data: { data: [mockSubscription], object: 'list' } });
    const result = await handler({ args: validArgs, auth: validAuth });
    expect(result.planName).toEqual('Product Name from Product Field');
  });

  it('should use N/A for planName if no suitable name field found', async () => {
    const mockSubscription = {
      id: 'sub_126',
      customer: mockCustomerId,
      current_period_end: 1700000000,
      status: 'active',
      plan: { id: 'plan_126' },
      items: { data: [{ plan: {} }] },
      trial_end: null,
    };
    axios.get.mockResolvedValue({ data: { data: [mockSubscription], object: 'list' } });
    const result = await handler({ args: validArgs, auth: validAuth });
    expect(result.planName).toEqual('N/A');
  });


  it('should return null if no active subscriptions are found', async () => {
    axios.get.mockResolvedValue({ data: { data: [], object: 'list' } });
    const result = await handler({ args: validArgs, auth: validAuth });
    expect(result).toBeNull();
  });

  it('should throw an error if Stripe API call fails', async () => {
    const apiError = new Error('Stripe API Error');
    apiError.response = { data: { error: { message: 'Invalid customer ID for subscriptions.' } } };
    axios.get.mockRejectedValue(apiError);
    await expect(handler({ args: validArgs, auth: validAuth })).rejects.toThrow('Stripe API Error: Invalid customer ID for subscriptions.');
  });

  it('should throw an error if no response received from Stripe API', async () => {
    const networkError = new Error('Network timeout');
    networkError.request = {};
    axios.get.mockRejectedValue(networkError);
    await expect(handler({ args: validArgs, auth: validAuth }))
      .rejects.toThrow(`No response received from Stripe API when fetching next billing date for customer ${mockCustomerId}. Check network connectivity.`);
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
    it('should throw Zod error if customerId is missing in args', async () => {
      await expectZodError({}, validAuth, "Required", true);
    });
    it('should throw Zod error if customerId is an empty string in args', async () => {
      await expectZodError({ customerId: '' }, validAuth, "Customer ID cannot be empty.", true);
    });

    it('should throw Zod error if token is missing in auth', async () => {
      await expectZodError(validArgs, {}, "Required", true);
    });
    it('should throw Zod error if token is an empty string in auth', async () => {
      await expectZodError(validArgs, { token: "" }, "Stripe API key (secret key) is required.", true);
    });
  });
});
