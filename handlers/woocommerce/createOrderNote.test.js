// handlers/woocommerce/createOrderNote.test.js
const { handler, ArgsSchema, ConnectionSchema } = require('./createOrderNote'); // Import ConnectionSchema
const axios = require('axios');

jest.mock('axios');

const mockBaseUrl = 'https://teststore.com';
const mockConsumerKey = 'ck_test_key';
const mockConsumerSecret = 'cs_test_secret';
const mockOrderId = 123;
const mockNoteContent = "This is a test note.";

describe('WooCommerce createOrderNote Handler', () => {
  beforeEach(() => {
    axios.post.mockReset();
  });

  const validAuth = {
    baseUrl: mockBaseUrl,
    consumerKey: mockConsumerKey,
    consumerSecret: mockConsumerSecret
  };
  const validBaseArgs = {
    orderId: mockOrderId,
    note: mockNoteContent
  };

  it('should create an order note successfully', async () => {
    const mockResponseNote = { id: 1, note: mockNoteContent, customer_note: false, date_created: new Date().toISOString() };
    axios.post.mockResolvedValue({ data: mockResponseNote });

    const result = await handler({ args: validBaseArgs, auth: validAuth });

    expect(axios.post).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wc/v3/orders/${mockOrderId}/notes`,
      { note: mockNoteContent },
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${mockConsumerKey}:${mockConsumerSecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      }
    );
    expect(result).toEqual(mockResponseNote);
  });

  it('should accept string orderId', async () => {
    const stringOrderId = "order_abc123";
    const argsWithStringOrderId = { ...validBaseArgs, orderId: stringOrderId };
    const mockResponseNote = { id: 1, note: mockNoteContent, customer_note: false };
    axios.post.mockResolvedValue({ data: mockResponseNote });

    await handler({ args: argsWithStringOrderId, auth: validAuth });
    expect(axios.post).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wc/v3/orders/${stringOrderId}/notes`,
      expect.objectContaining({ note: mockNoteContent }),
      expect.objectContaining({
         headers: {
          'Authorization': `Basic ${Buffer.from(`${mockConsumerKey}:${mockConsumerSecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      })
    );
  });

  it('should handle order not found (404) when trying to add a note', async () => {
    const apiError = new Error('Request failed with status code 404');
    apiError.response = {
      status: 404,
      data: { code: 'woocommerce_rest_shop_order_invalid_id', message: 'Invalid ID.' }
    };
    axios.post.mockRejectedValue(apiError);

    await expect(handler({ args: validBaseArgs, auth: validAuth })).rejects.toThrow(`Order ${mockOrderId} not found when trying to add note: Invalid ID.`);
  });

  it('should handle other API errors from WooCommerce', async () => {
    const apiError = new Error('WooCommerce API Error');
    apiError.response = { status: 400, data: { message: 'Invalid data provided.' } };
    axios.post.mockRejectedValue(apiError);

    await expect(handler({ args: validBaseArgs, auth: validAuth })).rejects.toThrow('Invalid data provided.');
  });

  it('should handle generic network errors', async () => {
    const networkError = new Error('Network connection failed');
    axios.post.mockRejectedValue(networkError);

    await expect(handler({ args: validBaseArgs, auth: validAuth })).rejects.toThrow('Network connection failed');
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
    it('should throw Zod error if baseUrl is missing from auth', async () => {
      const invalidAuth = { consumerKey: mockConsumerKey, consumerSecret: mockConsumerSecret };
      await expectZodError(validBaseArgs, invalidAuth, "Required", true);
    });

    it('should throw Zod error if baseUrl is invalid in auth', async () => {
      const invalidAuth = { ...validAuth, baseUrl: 'not-a-url' };
      await expectZodError(validBaseArgs, invalidAuth, "WooCommerce base URL is required.");
    });

    it('should throw Zod error if consumerKey is missing from auth', async () => {
      const invalidAuth = { baseUrl: mockBaseUrl, consumerSecret: mockConsumerSecret };
      await expectZodError(validBaseArgs, invalidAuth, "Required", true);
    });

    it('should throw Zod error if consumerKey is an empty string in auth', async () => {
      const invalidAuth = { ...validAuth, consumerKey: "" };
      await expectZodError(validBaseArgs, invalidAuth, "WooCommerce Consumer Key is required.", true);
    });

    it('should throw Zod error if consumerSecret is missing from auth', async () => {
      const invalidAuth = { baseUrl: mockBaseUrl, consumerKey: mockConsumerKey };
      await expectZodError(validBaseArgs, invalidAuth, "Required", true);
    });

    it('should throw Zod error if consumerSecret is an empty string in auth', async () => {
      const invalidAuth = { ...validAuth, consumerSecret: "" };
      await expectZodError(validBaseArgs, invalidAuth, "WooCommerce Consumer Secret is required.", true);
    });

    it('should throw Zod error if orderId is missing from args', async () => {
      const {orderId, ...incompleteArgs} = validBaseArgs;
      // For a missing field that is a union, Zod often defaults to "Invalid input"
      await expectZodError(incompleteArgs, validAuth, "Invalid input", false);
    });

    it('should throw Zod error if note is missing from args', async () => {
      const {note, ...incompleteArgs} = validBaseArgs;
      await expectZodError(incompleteArgs, validAuth, "Required", true);
    });

    it('should throw Zod error if note is an empty string in args', async () => {
      await expectZodError({ ...validBaseArgs, note: "" }, validAuth, "Note content cannot be empty", true);
    });

    it('should throw Zod error if orderId is 0 in args', async () => {
      await expectZodError({ ...validBaseArgs, orderId: 0 }, validAuth, "Order ID must be a positive integer");
    });

    it('should throw Zod error if orderId is an empty string in args', async () => {
      await expectZodError({ ...validBaseArgs, orderId: "" }, validAuth, "Order ID cannot be empty if a string");
    });
  });
});
