// handlers/woocommerce/createOrderNote.test.js
const { handler, ArgsSchema, ConnectionSchema } = require('./createOrderNote');
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
  const defaultArgs = {
    orderId: mockOrderId,
    note: mockNoteContent
    // customer_note is omitted, so it should default to false
  };

  it('should create a private order note by default when customer_note is omitted', async () => {
    const mockResponseNote = { id: 1, note: mockNoteContent, customer_note: false, date_created: new Date().toISOString() };
    axios.post.mockResolvedValue({ data: mockResponseNote });

    const result = await handler({ args: defaultArgs, auth: validAuth });

    expect(axios.post).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wc/v3/orders/${mockOrderId}/notes`,
      { note: mockNoteContent, customer_note: false }, // Expect customer_note: false (default)
      expect.objectContaining({
        headers: {
          'Authorization': `Basic ${Buffer.from(`${mockConsumerKey}:${mockConsumerSecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        }
      })
    );
    expect(result).toEqual(mockResponseNote);
  });

  it('should create a customer-visible note when customer_note is true', async () => {
    const argsWithCustomerNoteTrue = { ...defaultArgs, customer_note: true };
    const mockResponseNote = { id: 2, note: mockNoteContent, customer_note: true, date_created: new Date().toISOString() };
    axios.post.mockResolvedValue({ data: mockResponseNote });

    const result = await handler({ args: argsWithCustomerNoteTrue, auth: validAuth });

    expect(axios.post).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wc/v3/orders/${mockOrderId}/notes`,
      { note: mockNoteContent, customer_note: true },
      expect.objectContaining({ headers: expect.any(Object) })
    );
    expect(result).toEqual(mockResponseNote);
  });

  it('should create a private note when customer_note is explicitly false', async () => {
    const argsWithCustomerNoteFalse = { ...defaultArgs, customer_note: false };
    const mockResponseNote = { id: 3, note: mockNoteContent, customer_note: false, date_created: new Date().toISOString() };
    axios.post.mockResolvedValue({ data: mockResponseNote });

    const result = await handler({ args: argsWithCustomerNoteFalse, auth: validAuth });

    expect(axios.post).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wc/v3/orders/${mockOrderId}/notes`,
      { note: mockNoteContent, customer_note: false },
      expect.objectContaining({ headers: expect.any(Object) })
    );
    expect(result).toEqual(mockResponseNote);
  });

  it('should accept string orderId and respect customer_note default', async () => {
    const stringOrderId = "order_abc123";
    // customer_note omitted, should default to false
    const argsWithStringOrderId = { orderId: stringOrderId, note: mockNoteContent };
    const mockResponseNote = { id: 4, note: mockNoteContent, customer_note: false, date_created: new Date().toISOString() };
    axios.post.mockResolvedValue({ data: mockResponseNote });

    await handler({ args: argsWithStringOrderId, auth: validAuth });
    expect(axios.post).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wc/v3/orders/${stringOrderId}/notes`,
      expect.objectContaining({ note: mockNoteContent, customer_note: false }),
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it('should handle order not found (404) when trying to add a note', async () => {
    const apiError = new Error('Request failed with status code 404');
    apiError.response = { status: 404, data: { code: 'woocommerce_rest_shop_order_invalid_id', message: 'Invalid ID.' }};
    axios.post.mockRejectedValue(apiError);
    await expect(handler({ args: defaultArgs, auth: validAuth })).rejects.toThrow(`Order ${mockOrderId} not found when trying to add note: Invalid ID.`);
  });

  it('should handle other API errors from WooCommerce', async () => {
    const apiError = new Error('WooCommerce API Error');
    apiError.response = { status: 400, data: { message: 'Invalid data provided.' } };
    axios.post.mockRejectedValue(apiError);
    await expect(handler({ args: defaultArgs, auth: validAuth })).rejects.toThrow('Invalid data provided.');
  });

  it('should handle generic network errors', async () => {
    const networkError = new Error('Network connection failed');
    axios.post.mockRejectedValue(networkError);
    await expect(handler({ args: defaultArgs, auth: validAuth })).rejects.toThrow('Network connection failed');
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
      await expectZodError(defaultArgs, { consumerKey: mockConsumerKey, consumerSecret: mockConsumerSecret }, "Required", true);
    });
    it('should throw Zod error if baseUrl is invalid in auth', async () => {
      await expectZodError(defaultArgs, { ...validAuth, baseUrl: 'not-a-url' }, "WooCommerce base URL is required.");
    });
    it('should throw Zod error if consumerKey is missing from auth', async () => {
      await expectZodError(defaultArgs, { baseUrl: mockBaseUrl, consumerSecret: mockConsumerSecret }, "Required", true);
    });
    it('should throw Zod error if consumerKey is an empty string in auth', async () => {
      await expectZodError(defaultArgs, { ...validAuth, consumerKey: "" }, "WooCommerce Consumer Key is required.", true);
    });
    it('should throw Zod error if consumerSecret is missing from auth', async () => {
      await expectZodError(defaultArgs, { baseUrl: mockBaseUrl, consumerKey: mockConsumerKey }, "Required", true);
    });
    it('should throw Zod error if consumerSecret is an empty string in auth', async () => {
      await expectZodError(defaultArgs, { ...validAuth, consumerSecret: "" }, "WooCommerce Consumer Secret is required.", true);
    });

    it('should throw Zod error if orderId is missing from args', async () => {
      const {orderId, ...incompleteArgs} = defaultArgs;
      await expectZodError(incompleteArgs, validAuth, "Invalid input", false);
    });
    it('should throw Zod error if note is missing from args', async () => {
      const {note, ...incompleteArgs} = defaultArgs;
      await expectZodError(incompleteArgs, validAuth, "Required", true);
    });
    it('should throw Zod error if note is an empty string in args', async () => {
      await expectZodError({ ...defaultArgs, note: "" }, validAuth, "Note content cannot be empty", true);
    });
    it('should throw Zod error if orderId is 0 in args', async () => {
      await expectZodError({ ...defaultArgs, orderId: 0 }, validAuth, "Order ID must be a positive integer");
    });
    it('should throw Zod error if orderId is an empty string in args', async () => {
      await expectZodError({ ...defaultArgs, orderId: "" }, validAuth, "Order ID cannot be empty if a string");
    });
    it('should throw Zod error if customer_note is not a boolean', async () => {
      await expectZodError({ ...defaultArgs, customer_note: "true_string" }, validAuth, "Expected boolean, received string");
    });
    it('should accept customer_note as boolean true', async () => {
      axios.post.mockResolvedValue({ data: { id: 5, customer_note: true } });
      await expect(handler({ args: {...defaultArgs, customer_note: true}, auth: validAuth })).resolves.toBeDefined();
    });
    it('should accept customer_note as boolean false', async () => {
      axios.post.mockResolvedValue({ data: { id: 6, customer_note: false } });
      await expect(handler({ args: {...defaultArgs, customer_note: false}, auth: validAuth })).resolves.toBeDefined();
    });
  });
});
