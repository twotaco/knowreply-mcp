// handlers/woocommerce/createDraftOrder.test.js
const { handler, ArgsSchema } = require('./createDraftOrder');
const axios = require('axios');

jest.mock('axios');

const mockBaseUrl = 'https://teststore.com';
const mockConsumerKey = 'ck_test_key';
const mockConsumerSecret = 'cs_test_secret';

describe('WooCommerce createDraftOrder Handler', () => {
  beforeEach(() => {
    axios.post.mockReset();
  });

  const validBaseArgs = {
    baseUrl: mockBaseUrl,
    consumerKey: mockConsumerKey,
    consumerSecret: mockConsumerSecret,
  };

  const minimalOrderData = {
    line_items: [{ product_id: 1, quantity: 1 }],
  };

  it('should create a draft order with minimal valid data (defaulting to draft status)', async () => {
    const args = { ...validBaseArgs, orderData: minimalOrderData };
    const mockResponseOrder = { id: 101, status: 'draft', line_items: minimalOrderData.line_items };
    axios.post.mockResolvedValue({ data: mockResponseOrder });

    const result = await handler({ args });

    expect(axios.post).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wc/v3/orders`,
      expect.objectContaining({ 
        line_items: minimalOrderData.line_items,
        status: 'draft' // Expecting default status
      }),
      expect.objectContaining({ headers: expect.any(Object) })
    );
    expect(result).toEqual(mockResponseOrder);
  });

  it('should create an order with a specified status (e.g., pending)', async () => {
    const orderDataWithStatus = { ...minimalOrderData, status: 'pending' };
    const args = { ...validBaseArgs, orderData: orderDataWithStatus };
    const mockResponseOrder = { id: 102, status: 'pending', line_items: orderDataWithStatus.line_items };
    axios.post.mockResolvedValue({ data: mockResponseOrder });

    const result = await handler({ args });

    expect(axios.post).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wc/v3/orders`,
      expect.objectContaining({ status: 'pending' }),
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
    const args = { ...validBaseArgs, orderData: fullOrderData };
    const mockResponseOrder = { id: 103, ...fullOrderData };
    axios.post.mockResolvedValue({ data: mockResponseOrder });

    const result = await handler({ args });
    expect(axios.post).toHaveBeenCalledWith(
      expect.any(String),
      fullOrderData, // Expect the full payload to be passed
      expect.any(Object)
    );
    expect(result).toEqual(mockResponseOrder);
  });


  it('should handle API errors from WooCommerce (e.g., invalid product_id)', async () => {
    // Ensure the line_items structure is valid for Zod, but will be rejected by the mock API
    const orderDataWithInvalidProduct = { line_items: [{product_id: 9999, quantity: 1}] };
    const args = { ...validBaseArgs, orderData: orderDataWithInvalidProduct }; 
    const apiError = new Error('API Error');
    apiError.response = { data: { message: 'Invalid product ID.' } };
    axios.post.mockRejectedValue(apiError);

    await expect(handler({ args })).rejects.toThrow('Invalid product ID.');
  });

  it('should handle generic network errors', async () => {
    const args = { ...validBaseArgs, orderData: minimalOrderData };
    const networkError = new Error('Network Error');
    axios.post.mockRejectedValue(networkError);

    await expect(handler({ args })).rejects.toThrow('Network Error');
  });
  
  // Helper for Zod validation error checks
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
    // Test for missing base args
    ['baseUrl', 'consumerKey', 'consumerSecret', 'orderData'].forEach(field => {
      it(`should throw Zod error if ${field} is missing`, async () => {
        const incompleteArgs = { ...validBaseArgs, orderData: minimalOrderData };
        delete incompleteArgs[field];
        // For missing fields, Zod's default message is "Required".
        await expectZodError(incompleteArgs, "Required");
      });
    });
    
    it('should throw Zod error if orderData.line_items is missing or empty', async () => {
        // Test case for orderData being an empty object (so line_items is missing)
        await expectZodError({ ...validBaseArgs, orderData: {} }, "Required"); 
        // Test case for line_items being an empty array
        await expectZodError({ ...validBaseArgs, orderData: { line_items: [] } }, "Order must have at least one line item.");
    });

    it('should throw Zod error if line_items[0].product_id is invalid', async () => {
      await expectZodError({ ...validBaseArgs, orderData: { line_items: [{ product_id: 0 }] } }, "Number must be greater than 0");
    });
    
    it('should throw Zod error if line_items[0].quantity is invalid (e.g. 0)', async () => {
      // The schema has .default(1) for quantity, but if 0 is explicitly passed, it should fail .positive()
      await expectZodError({ ...validBaseArgs, orderData: { line_items: [{ product_id: 1, quantity: 0 }] } }, "Number must be greater than 0");
    });
    
    it('should throw Zod error if status is invalid enum value', async () => {
      await expectZodError({ ...validBaseArgs, orderData: { ...minimalOrderData, status: 'invalid_status' } }, "Invalid enum value.");
    });
    
    it('should throw Zod error if billing.email is invalid', async () => {
      await expectZodError({ 
        ...validBaseArgs, 
        orderData: { ...minimalOrderData, billing: { email: 'not-an-email' } } 
      }, "Invalid email");
    });

    it('should default quantity in line_items to 1 if not provided', async () => {
        const orderDataNoQuantity = { line_items: [{ product_id: 1 }] }; // Quantity missing
        const args = { ...validBaseArgs, orderData: orderDataNoQuantity };
        const mockResponseOrder = { id: 104, status: 'draft', line_items: [{product_id: 1, quantity: 1}] }; // Expected response
        axios.post.mockResolvedValue({ data: mockResponseOrder });

        await handler({ args });
        expect(axios.post).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                line_items: expect.arrayContaining([
                    expect.objectContaining({ product_id: 1, quantity: 1 }) 
                ]),
                status: 'draft' // Also check default status is applied to payload
            }),
            expect.any(Object)
        );
    });
  });
});
