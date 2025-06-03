// handlers/stripe/sendInvoice.test.js
const { handler, ArgsSchema, AuthSchema } = require('./sendInvoice');
const axios = require('axios');

jest.mock('axios');

const mockApiKey = 'sk_test_yourstripesecretkey';
const mockInvoiceId = 'in_testinvoice123';

describe('Stripe sendInvoice Handler', () => {
  beforeEach(() => {
    axios.post.mockReset();
  });

  const validArgs = { invoiceId: mockInvoiceId };
  const validAuth = { token: mockApiKey };

  it('should send an invoice successfully', async () => {
    const stripeInvoiceResponse = {
      id: mockInvoiceId,
      object: 'invoice',
      status: 'open', // Or 'sent', depending on Stripe's immediate response
      sent: true,
      // ... other Stripe invoice fields
    };
    axios.post.mockResolvedValue({ data: stripeInvoiceResponse });

    const result = await handler({ args: validArgs, auth: validAuth });

    expect(axios.post).toHaveBeenCalledWith(
      `https://api.stripe.com/v1/invoices/${mockInvoiceId}/send`,
      null, // No body
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
      status: 400, // Status might vary, but code is key
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
    networkError.request = {}; // Indicates a request was made
    axios.post.mockRejectedValue(networkError);

    await expect(handler({ args: validArgs, auth: validAuth }))
      .rejects.toThrow(`No response received from Stripe API when trying to send invoice ${mockInvoiceId}. Check network connectivity.`);
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
    it('should throw Zod error if invoiceId is missing in args', async () => {
      // ArgsSchema expects 'invoiceId'. If args is {}, invoiceId is missing.
      await expectZodError({}, validAuth, "Required");
    });

    it('should throw Zod error if invoiceId is an empty string in args', async () => {
      // ArgsSchema has .min(1) for invoiceId.
      await expectZodError({ invoiceId: '' }, validAuth, "Stripe Invoice ID is required.");
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
