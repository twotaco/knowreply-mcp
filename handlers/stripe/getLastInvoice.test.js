// handlers/stripe/getLastInvoice.test.js
const { handler, ArgsSchema, ConnectionSchema } = require('./getLastInvoice');
const axios = require('axios');

jest.mock('axios');

const mockApiKey = 'sk_test_yourstripesecretkey';
const mockCustomerId = 'cus_testcustomerid123';

describe('Stripe getLastInvoice Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  const validArgs = { customerId: mockCustomerId };
  const validAuth = { token: mockApiKey };

  it('should fetch the last invoice for a customer successfully', async () => {
    const stripeInvoice = {
      id: 'in_1LqgGq2eZvKYlo2ClQqG7iXG',
      customer: mockCustomerId,
      amount_due: 1000,
      amount_paid: 1000,
      amount_remaining: 0,
      currency: 'usd',
      status: 'paid',
      due_date: null,
      created: 1666287600, // Example Unix timestamp
      invoice_pdf: 'https://pay.stripe.com/invoice/acct_123/invst_ABC/pdf',
      hosted_invoice_url: 'https://pay.stripe.com/invoice/acct_123/invst_ABC',
      lines: {
        object: 'list',
        data: [
          {
            id: 'il_1LqgGq2eZvKYlo2Cj7gA8sSg',
            description: 'My First Invoice Item',
            amount: 1000,
            currency: 'usd',
            quantity: 1,
            period: { start: 1666287600, end: 1666287600 }
          }
        ],
        has_more: false,
        url: '/v1/invoices/in_1LqgGq2eZvKYlo2ClQqG7iXG/lines'
      }
    };
    axios.get.mockResolvedValue({ data: { data: [stripeInvoice], object: 'list' } });

    const result = await handler({ args: validArgs, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/invoices',
      {
        params: { customer: mockCustomerId, limit: 1 },
        headers: { 'Authorization': `Bearer ${mockApiKey}` },
      }
    );
    expect(result).toEqual({
      id: 'in_1LqgGq2eZvKYlo2ClQqG7iXG',
      customer: mockCustomerId,
      amount_due: 1000,
      amount_paid: 1000,
      amount_remaining: 0,
      currency: 'usd',
      status: 'paid',
      due_date: null,
      created: 1666287600,
      invoice_pdf: 'https://pay.stripe.com/invoice/acct_123/invst_ABC/pdf',
      hosted_invoice_url: 'https://pay.stripe.com/invoice/acct_123/invst_ABC',
      lines: [
          {
            id: 'il_1LqgGq2eZvKYlo2Cj7gA8sSg',
            description: 'My First Invoice Item',
            amount: 1000,
            currency: 'usd',
            quantity: 1,
            period: { start: 1666287600, end: 1666287600 }
          }
        ]
    });
  });

  it('should return null if no invoices are found for the customer', async () => {
    axios.get.mockResolvedValue({ data: { data: [], object: 'list' } });
    const result = await handler({ args: validArgs, auth: validAuth });
    expect(result).toBeNull();
  });

  it('should throw an error if Stripe API call fails', async () => {
    const apiError = new Error('Stripe API Error');
    apiError.response = { data: { error: { message: 'Invalid customer ID.' } } };
    axios.get.mockRejectedValue(apiError);
    await expect(handler({ args: validArgs, auth: validAuth })).rejects.toThrow('Stripe API Error: Invalid customer ID.');
  });

  it('should throw an error if no response received from Stripe API', async () => {
    const networkError = new Error('Network timeout');
    networkError.request = {};
    axios.get.mockRejectedValue(networkError);
    await expect(handler({ args: validArgs, auth: validAuth }))
      .rejects.toThrow(`No response received from Stripe API when fetching last invoice for customer ${mockCustomerId}. Check network connectivity.`);
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
    it('should throw Zod error if customerId is missing in args', async () => {
      await expectZodError({}, validAuth, "Required", true);
    });
    it('should throw Zod error if customerId is an empty string in args', async () => {
      await expectZodError({ customerId: '' }, validAuth, "Customer ID cannot be empty.", true);
    });

    // ConnectionSchema tests
    it('should throw Zod error if token is missing in auth', async () => {
      await expectZodError(validArgs, {}, "Required", true);
    });
    it('should throw Zod error if token is an empty string in auth', async () => {
      await expectZodError(validArgs, { token: "" }, "Stripe API key (secret key) is required.", true);
    });
  });
});
