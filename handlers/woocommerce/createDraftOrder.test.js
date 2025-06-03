// handlers/woocommerce/createDraftOrder.test.js
const { handler, ArgsSchema, ConnectionSchema, LineItemSchema } = require('./createDraftOrder'); // Import ConnectionSchema & LineItemSchema
const axios = require('axios');

jest.mock('axios');

const mockBaseUrl = 'https://teststore.com';
const mockConsumerKey = 'ck_test_key';
const mockConsumerSecret = 'cs_test_secret';

describe('WooCommerce createDraftOrder Handler', () => {
  beforeEach(() => {
    axios.post.mockReset();
  });

  const validAuth = {
    baseUrl: mockBaseUrl,
    consumerKey: mockConsumerKey,
    consumerSecret: mockConsumerSecret
  };

  const minimalLineItems = [{ product_id: 1, quantity: 1 }];
  const minimalOrderData = { line_items: minimalLineItems };
  const minimalArgs = { orderData: minimalOrderData }; // Args now nests orderData

  it('should create a draft order with minimal valid data (defaulting to draft status)', async () => {
    // The handler now extracts orderData from args, so the payload sent to axios.post
    // will be the content of orderData, with status defaulted.
    const expectedPayload = { ...minimalOrderData, status: 'draft' };
    const mockResponseOrder = { id: 101, ...expectedPayload };
    axios.post.mockResolvedValue({ data: mockResponseOrder });

    const result = await handler({ args: minimalArgs, auth: validAuth });

    expect(axios.post).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wc/v3/orders`,
      expect.objectContaining(expectedPayload),
      expect.objectContaining({
        headers: {
          'Authorization': `Basic ${Buffer.from(`${mockConsumerKey}:${mockConsumerSecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        }
      })
    );
    expect(result).toEqual(mockResponseOrder);
  });

  it('should create an order with a specified status (e.g., pending)', async () => {
    const orderDataWithStatus = { ...minimalOrderData, status: 'pending' };
    const args = { orderData: orderDataWithStatus }; // Nest under orderData
    const mockResponseOrder = { id: 102, ...orderDataWithStatus };
    axios.post.mockResolvedValue({ data: mockResponseOrder });

    const result = await handler({ args, auth: validAuth });

    expect(axios.post).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wc/v3/orders`,
      expect.objectContaining({ status: 'pending', line_items: minimalLineItems }),
      expect.any(Object)
    );
    expect(result).toEqual(mockResponseOrder);
  });

  it('should create an order with customer_id and billing/shipping info', async () => {
    const fullOrderData = {
      customer_id: 5,
      billing: { first_name: "John", email: "john@example.com" },
      shipping: { first_name: "John", address_1: "123 Street" },
      line_items: [{ product_id: 2, quantity: 2, variation_id: 10 }],
      status: 'on-hold'
    };
    const args = { orderData: fullOrderData }; // Nest under orderData
    const mockResponseOrder = { id: 103, ...fullOrderData };
    axios.post.mockResolvedValue({ data: mockResponseOrder });

    const result = await handler({ args, auth: validAuth });
    expect(axios.post).toHaveBeenCalledWith(
      expect.any(String),
      fullOrderData,
      expect.any(Object)
    );
    expect(result).toEqual(mockResponseOrder);
  });

  it('should handle API errors from WooCommerce (e.g., invalid product_id)', async () => {
    const orderDataWithInvalidProduct = { line_items: [{product_id: 9999, quantity: 1}] };
    const args = { orderData: orderDataWithInvalidProduct };
    const apiError = new Error('API Error');
    apiError.response = { data: { message: 'Invalid product ID.' } };
    axios.post.mockRejectedValue(apiError);

    await expect(handler({ args, auth: validAuth })).rejects.toThrow('Invalid product ID.');
  });

  it('should handle generic network errors', async () => {
    const networkError = new Error('Network Error');
    axios.post.mockRejectedValue(networkError);

    await expect(handler({ args: minimalArgs, auth: validAuth })).rejects.toThrow('Network Error');
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
    // ConnectionSchema tests (auth object)
    it('should throw Zod error if baseUrl is missing from auth', async () => {
      const invalidAuth = { consumerKey: mockConsumerKey, consumerSecret: mockConsumerSecret };
      await expectZodError(minimalArgs, invalidAuth, "Required", true);
    });
    it('should throw Zod error if baseUrl is invalid in auth', async () => {
      const invalidAuth = { ...validAuth, baseUrl: 'not-a-url' };
      await expectZodError(minimalArgs, invalidAuth, "WooCommerce base URL is required.");
    });
    it('should throw Zod error if consumerKey is missing from auth', async () => {
      const invalidAuth = { baseUrl: mockBaseUrl, consumerSecret: mockConsumerSecret };
      await expectZodError(minimalArgs, invalidAuth, "Required", true);
    });
    it('should throw Zod error if consumerKey is an empty string in auth', async () => {
      const invalidAuth = { ...validAuth, consumerKey: ""};
      await expectZodError(minimalArgs, invalidAuth, "WooCommerce Consumer Key is required.", true);
    });
    it('should throw Zod error if consumerSecret is missing from auth', async () => {
      const invalidAuth = { baseUrl: mockBaseUrl, consumerKey: mockConsumerKey };
      await expectZodError(minimalArgs, invalidAuth, "Required", true);
    });
    it('should throw Zod error if consumerSecret is an empty string in auth', async () => {
      const invalidAuth = { ...validAuth, consumerSecret: ""};
      await expectZodError(minimalArgs, invalidAuth, "WooCommerce Consumer Secret is required.", true);
    });

    // ArgsSchema tests (args object and its nested orderData)
    it('should throw Zod error if orderData is missing from args', async () => {
        await expectZodError({}, validAuth, "Required", true); // args.orderData is required
    });

    it('should throw Zod error if orderData.line_items is missing or empty', async () => {
        // Test case for orderData being an object but line_items missing
        await expectZodError({ orderData: {} }, validAuth, "Required", true);
        // Test case for line_items being an empty array
        await expectZodError({ orderData: { line_items: [] } }, validAuth, "Order must have at least one line item.", true);
    });

    it('should throw Zod error if line_items[0].product_id is invalid in args.orderData', async () => {
      await expectZodError({ orderData: { line_items: [{ product_id: 0 }] } }, validAuth, "Number must be greater than 0");
    });

    it('should throw Zod error if line_items[0].quantity is invalid in args.orderData', async () => {
      await expectZodError({ orderData: { line_items: [{ product_id: 1, quantity: 0 }] } }, validAuth, "Number must be greater than 0");
    });

    it('should throw Zod error if status is invalid enum value in args.orderData', async () => {
      await expectZodError({ orderData: { ...minimalOrderData, status: 'invalid_status' } }, validAuth, "Invalid enum value.");
    });

    it('should throw Zod error if billing.email is invalid in args.orderData', async () => {
      await expectZodError({
        orderData: { ...minimalOrderData, billing: { email: 'not-an-email' } }
      }, validAuth, "Invalid email");
    });

    it('should default quantity in line_items to 1 if not provided', async () => {
        const orderDataNoQuantity = { line_items: [{ product_id: 1 }] };
        const args = { orderData: orderDataNoQuantity };
        const expectedPayload = { line_items: [{product_id: 1, quantity: 1}], status: 'draft' };
        const mockResponseOrder = { id: 104, ...expectedPayload };
        axios.post.mockResolvedValue({ data: mockResponseOrder });

        await handler({ args, auth: validAuth });
        expect(axios.post).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining(expectedPayload),
            expect.any(Object)
        );
    });
  });
});
