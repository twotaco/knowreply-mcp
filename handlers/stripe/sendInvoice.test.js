// handlers/stripe/sendInvoice.test.js
const { handler, ArgsSchema, ConnectionSchema } = require('./sendInvoice'); // Updated to import ConnectionSchema
const axios = require('axios');

jest.mock('axios');

const mockApiKey = 'sk_test_yourstripesecretkey';
const mockInvoiceId = 'in_testinvoice123';

describe('Stripe sendInvoice Handler', () => {
  beforeEach(() => {
    axios.post.mockReset();
  });

  const validArgs = { invoiceId: mockInvoiceId };
  const validAuth = { token: mockApiKey }; // This structure is compatible with the new ConnectionSchema

  it('should send an invoice successfully', async () => {
    const stripeInvoiceResponse = {
      id: mockInvoiceId,
      object: 'invoice',
      status: 'open',
      sent: true,
    };
    axios.post.mockResolvedValue({ data: stripeInvoiceResponse });

    const result = await handler({ args: validArgs, auth: validAuth });

    expect(axios.post).toHaveBeenCalledWith(
      `https://api.stripe.com/v1/invoices/${mockInvoiceId}/send`,
      null,
      {
        headers: { 'Authorization': `Bearer ${mockApiKey}` },
      }
    );
    expect(result).toEqual(stripeInvoiceResponse);
  });

  it('should throw a specific error if invoice not found (404)', async () => {
    const apiError = new Error('Request failed with status code 404');
    apiError.response = {
      status: 404,
      data: { error: { type: 'invalid_request_error', message: `No such invoice: '${mockInvoiceId}'` } }
    };
    axios.post.mockRejectedValue(apiError);

    await expect(handler({ args: validArgs, auth: validAuth })).rejects.toThrow(`Stripe Invoice with ID '${mockInvoiceId}' not found.`);
  });

  it('should throw a specific error if invoice cannot be sent (e.g., already paid)', async () => {
    const apiError = new Error('Request failed with status code 400');
    apiError.response = {
      status: 400,
      data: {
        error: {
          code: 'invoice_payment_action_not_supported',
          message: 'Invoices that are paid, marked uncollectible, or void cannot be sent.'
        }
      }
    };
    axios.post.mockRejectedValue(apiError);

    await expect(handler({ args: validArgs, auth: validAuth }))
      .rejects.toThrow(`Could not send invoice ${mockInvoiceId}: Invoices that are paid, marked uncollectible, or void cannot be sent.`);
  });

  it('should throw an error if Stripe API call fails with other errors', async () => {
    const apiError = new Error('Stripe API Error');
    apiError.response = { data: { error: { message: 'An unexpected error occurred.' } } };
    axios.post.mockRejectedValue(apiError);

    await expect(handler({ args: validArgs, auth: validAuth })).rejects.toThrow('Stripe API Error: An unexpected error occurred.');
  });

  it('should throw an error if no response received from Stripe API', async () => {
    const networkError = new Error('Network timeout');
    networkError.request = {};
    axios.post.mockRejectedValue(networkError);

    await expect(handler({ args: validArgs, auth: validAuth }))
      .rejects.toThrow(`No response received from Stripe API when trying to send invoice ${mockInvoiceId}. Check network connectivity.`);
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
    it('should throw Zod error if invoiceId is missing in args', async () => {
      await expectZodError({}, validAuth, "Required", true);
    });

    it('should throw Zod error if invoiceId is an empty string in args', async () => {
      await expectZodError({ invoiceId: '' }, validAuth, "Stripe Invoice ID is required.");
    });

    it('should throw Zod error if token is missing in auth', async () => {
      await expectZodError(validArgs, {}, "Required", true);
    });

    it('should throw Zod error if token is an empty string in auth', async () => {
      await expectZodError(validArgs, { token: "" }, "Stripe API key (secret key) is required.");
    });
  });
});
