// handlers/stripe/getInvoices.test.js
const { handler, ArgsSchema, AuthSchema } = require('./getInvoices');
const axios = require('axios');

jest.mock('axios');

const mockApiKey = 'sk_test_yourstripesecretkey';

describe('Stripe getInvoices Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  const validAuth = { token: mockApiKey };
  const mockInvoiceListResponse = {
    object: 'list',
    data: [
      { id: 'in_1', customer: 'cus_1', status: 'paid' },
      { id: 'in_2', customer: 'cus_1', status: 'open' },
    ],
    has_more: false,
    url: '/v1/invoices'
  };

  it('should fetch invoices with no filters successfully', async () => {
    axios.get.mockResolvedValue({ data: mockInvoiceListResponse });
    const result = await handler({ args: {}, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/invoices',
      {
        params: {},
        headers: { 'Authorization': `Bearer ${mockApiKey}` },
      }
    );
    expect(result).toEqual(mockInvoiceListResponse);
  });

  it('should fetch invoices with customerId filter', async () => {
    const args = { customerId: 'cus_123' };
    axios.get.mockResolvedValue({ data: { ...mockInvoiceListResponse, data: [mockInvoiceListResponse.data[0]]} }); // Simulating filtered response
    await handler({ args, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/invoices',
      expect.objectContaining({ params: { customer: 'cus_123' } })
    );
  });

  it('should fetch invoices with status and limit filters', async () => {
    const args = { status: 'paid', limit: 10 };
    axios.get.mockResolvedValue({ data: { ...mockInvoiceListResponse, data: [mockInvoiceListResponse.data[0]]} });
    await handler({ args, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/invoices',
      expect.objectContaining({ params: { status: 'paid', limit: 10 } })
    );
  });
  
  it('should fetch invoices with subscriptionId and pagination (starting_after)', async () => {
    const args = { subscriptionId: 'sub_123', starting_after: 'in_prev123' };
    axios.get.mockResolvedValue({ data: mockInvoiceListResponse });
    await handler({ args, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/invoices',
      expect.objectContaining({ params: { subscription: 'sub_123', starting_after: 'in_prev123' } })
    );
  });


  it('should throw an error if Stripe API call fails', async () => {
    const apiError = new Error('Stripe API Error');
    apiError.response = { data: { error: { message: 'Invalid parameter.' } } };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: {}, auth: validAuth })).rejects.toThrow('Stripe API Error: Invalid parameter.');
  });

  it('should throw an error if no response received from Stripe API', async () => {
    const networkError = new Error('Network problem');
    networkError.request = {}; // Indicates a request was made
    axios.get.mockRejectedValue(networkError);
    
    await expect(handler({ args: {}, auth: validAuth }))
      .rejects.toThrow('No response received from Stripe API when fetching invoices. Check network connectivity.');
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
    it('should accept empty args (all filters optional)', async () => {
      axios.get.mockResolvedValue({ data: mockInvoiceListResponse });
      await expect(handler({ args: {}, auth: validAuth })).resolves.toEqual(mockInvoiceListResponse);
    });

    it('should throw Zod error for invalid status enum', async () => {
      // Zod's message for invalid enum is quite specific.
      await expectZodError({ status: 'pending' }, validAuth, "Invalid enum value. Expected 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'");
    });
    
    it('should throw Zod error for invalid limit type', async () => {
      await expectZodError({ limit: 'not-a-number' }, validAuth, "Expected number, received string");
    });
    
    it('should throw Zod error for limit out of range (e.g., 0 or >100)', async () => {
      await expectZodError({ limit: 0 }, validAuth, "Number must be greater than 0");
      await expectZodError({ limit: 101 }, validAuth, "Number must be less than or equal to 100");
    });

    it('should throw Zod error if token is missing in auth', async () => {
      // AuthSchema expects 'token'. If auth is {}, token is missing.
      await expectZodError({}, {}, "Required");
    });
    
    it('should throw Zod error if token is an empty string in auth', async () => {
      // AuthSchema has .min(1) for token.
      await expectZodError({}, { token: "" }, "Stripe API key (secret key) is required.");
    });
  });
});
