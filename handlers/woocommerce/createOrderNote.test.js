// handlers/woocommerce/createOrderNote.test.js
const { handler, ArgsSchema } = require('./createOrderNote');
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

  const validArgs = {
    baseUrl: mockBaseUrl,
    consumerKey: mockConsumerKey,
    consumerSecret: mockConsumerSecret,
    orderId: mockOrderId,
    note: mockNoteContent,
  };

  it('should create an order note successfully', async () => {
    const mockResponseNote = { id: 1, note: mockNoteContent, customer_note: false, date_created: new Date().toISOString() };
    axios.post.mockResolvedValue({ data: mockResponseNote });

    const result = await handler({ args: validArgs });

    expect(axios.post).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wc/v3/orders/${mockOrderId}/notes`,
      { note: mockNoteContent }, // Payload
      { // Config with headers
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
    const argsWithStringOrderId = { ...validArgs, orderId: stringOrderId };
    const mockResponseNote = { id: 1, note: mockNoteContent, customer_note: false };
    axios.post.mockResolvedValue({ data: mockResponseNote });

    await handler({ args: argsWithStringOrderId });
    expect(axios.post).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wc/v3/orders/${stringOrderId}/notes`,
      expect.any(Object), // payload
      expect.any(Object)  // config with headers
    );
  });

  it('should handle order not found (404) when trying to add a note', async () => {
    const apiError = new Error('Request failed with status code 404');
    apiError.response = {
      status: 404,
      data: { code: 'woocommerce_rest_shop_order_invalid_id', message: 'Invalid ID.' }
    };
    axios.post.mockRejectedValue(apiError);

    await expect(handler({ args: validArgs })).rejects.toThrow(`Order ${mockOrderId} not found when trying to add note: Invalid ID.`);
  });

  it('should handle other API errors from WooCommerce', async () => {
    const apiError = new Error('WooCommerce API Error');
    apiError.response = { status: 400, data: { message: 'Invalid data provided.' } };
    axios.post.mockRejectedValue(apiError);

    await expect(handler({ args: validArgs })).rejects.toThrow('Invalid data provided.');
  });

  it('should handle generic network errors', async () => {
    const networkError = new Error('Network connection failed');
    axios.post.mockRejectedValue(networkError);

    await expect(handler({ args: validArgs })).rejects.toThrow('Network connection failed');
  });

  const expectZodError = async (args, expectedMessagePart) => {
      try {
          await handler({ args });
          throw new Error('Handler did not throw an error as expected.');
      } catch (error) {
          expect(error.name).toBe('ZodError');
          const hasMatchingError = error.errors.some(err => err.message.includes(expectedMessagePart));
          expect(hasMatchingError).toBe(true);
      }
  };

  describe('ArgsSchema Validation', () => {
    ['baseUrl', 'consumerKey', 'consumerSecret', 'orderId', 'note'].forEach(field => {
      it(`should throw Zod validation error if ${field} is missing`, async () => {
        const incompleteArgs = { ...validArgs };
        delete incompleteArgs[field];

        let expectedMessage = "Required";
        // For union types like orderId, Zod might throw "Invalid input" if the field is missing,
        // as 'undefined' doesn't match any part of the union.
        if (field === 'orderId') {
            expectedMessage = "Invalid input";
        }

        await expectZodError(incompleteArgs, expectedMessage);
      });
    });

    it('should throw Zod validation error if baseUrl is invalid', async () => {
      await expectZodError({ ...validArgs, baseUrl: 'not-a-url' }, "Invalid WooCommerce base URL");
    });

    ['consumerKey', 'consumerSecret', 'note'].forEach(field => {
         it(`should throw Zod validation error if ${field} is an empty string`, async () => {
            let expectedMessage = "";
            if (field === 'consumerKey') expectedMessage = "WooCommerce Consumer Key is required";
            else if (field === 'consumerSecret') expectedMessage = "WooCommerce Consumer Secret is required";
            else if (field === 'note') expectedMessage = "Note content cannot be empty";
            await expectZodError({ ...validArgs, [field]: "" }, expectedMessage);
        });
    });

    it('should throw Zod validation error if orderId is 0', async () => {
      await expectZodError({ ...validArgs, orderId: 0 }, "Order ID must be a positive integer");
    });

    it('should throw Zod validation error if orderId is an empty string', async () => {
      await expectZodError({ ...validArgs, orderId: "" }, "Order ID cannot be empty if a string");
    });
  });
});
