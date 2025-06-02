// handlers/woocommerce/getProducts.test.js
const { handler, ArgsSchema } = require('./getProducts');
const axios = require('axios');

jest.mock('axios');

const mockBaseUrl = 'https://teststore.com';
const mockConsumerKey = 'ck_test_key';
const mockConsumerSecret = 'cs_test_secret';

describe('WooCommerce getProducts Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  const baseValidArgs = {
    baseUrl: mockBaseUrl,
    consumerKey: mockConsumerKey,
    consumerSecret: mockConsumerSecret,
  };

  // --- Tests for fetching a single product by ID ---
  describe('Fetch Single Product by ID', () => {
    const mockProductId = 101;
    const validArgsWithProductId = { ...baseValidArgs, productId: mockProductId };
    const mockProduct = { id: mockProductId, name: 'Awesome T-Shirt', price: '25.00' };

    it('should fetch a single product by numeric ID', async () => {
      axios.get.mockResolvedValue({ data: mockProduct });
      const result = await handler({ args: validArgsWithProductId });

      expect(axios.get).toHaveBeenCalledWith(
        `${mockBaseUrl}/wp-json/wc/v3/products/${mockProductId}`,
        expect.objectContaining({
          headers: expect.any(Object),
          params: undefined,
        })
      );
      expect(result).toEqual(mockProduct);
    });

    it('should fetch a single product by string ID', async () => {
      const stringProductId = "product_str_102";
      const argsWithStringId = { ...baseValidArgs, productId: stringProductId };
      const mockProductString = { id: stringProductId, name: 'Awesome String T-Shirt', price: '26.00' };

      axios.get.mockResolvedValue({ data: mockProductString });
      const result = await handler({ args: argsWithStringId });
       expect(axios.get).toHaveBeenCalledWith(
        `${mockBaseUrl}/wp-json/wc/v3/products/${stringProductId}`,
        expect.objectContaining({
          headers: expect.any(Object),
          params: undefined,
        })
      );
      expect(result).toEqual(mockProductString);
    });


    it('should handle product not found (404) for single product fetch', async () => {
      const apiError = new Error('Request failed with status code 404');
      apiError.response = {
        status: 404,
        data: { code: 'woocommerce_rest_product_invalid_id', message: 'Invalid ID.' }
      };
      axios.get.mockRejectedValue(apiError);

      await expect(handler({ args: validArgsWithProductId })).rejects.toThrow(`Product with ID ${mockProductId} not found. Invalid ID.`);
    });
  });

  // --- Tests for listing/searching products ---
  describe('List and Search Products', () => {
    const mockProductList = [
      { id: 201, name: 'Cool Gadget', price: '99.00' },
      { id: 202, name: 'Useful Widget', price: '49.00' },
    ];

    it('should list all products if no productId or search term is provided', async () => {
      axios.get.mockResolvedValue({ data: mockProductList });
      const result = await handler({ args: baseValidArgs });

      expect(axios.get).toHaveBeenCalledWith(
        `${mockBaseUrl}/wp-json/wc/v3/products`,
        expect.objectContaining({
          headers: expect.any(Object),
          params: undefined,
        })
      );
      expect(result).toEqual(mockProductList);
    });

    it('should list products with a search term', async () => {
      const searchTerm = 'Gadget';
      const argsWithSearch = { ...baseValidArgs, search: searchTerm };
      const filteredMockList = [{ id: 201, name: 'Cool Gadget', price: '99.00' }];
      axios.get.mockResolvedValue({ data: filteredMockList });

      const result = await handler({ args: argsWithSearch });

      expect(axios.get).toHaveBeenCalledWith(
        `${mockBaseUrl}/wp-json/wc/v3/products`,
        expect.objectContaining({
          headers: expect.any(Object),
          params: { search: searchTerm },
        })
      );
      expect(result).toEqual(filteredMockList);
    });

    it('should not pass search param if search string is empty', async () => {
      const argsWithEmptySearch = { ...baseValidArgs, search: '' };
      axios.get.mockResolvedValue({ data: mockProductList });

      await handler({ args: argsWithEmptySearch });
      expect(axios.get).toHaveBeenCalledWith(
        `${mockBaseUrl}/wp-json/wc/v3/products`,
        expect.objectContaining({
          params: undefined, // Empty search string is falsy, so 'search' param is omitted by handler
        })
      );
    });
  });

  // --- General Error Handling and Validation ---
  describe('General Error Handling and Validation', () => {
    it('should handle general API errors from WooCommerce when listing', async () => {
      const apiError = new Error('WooCommerce API Error');
      apiError.response = { data: { message: 'Some listing error' } };
      axios.get.mockRejectedValue(apiError);

      await expect(handler({ args: baseValidArgs })).rejects.toThrow('Some listing error');
    });

    it('should handle generic network errors', async () => {
      const networkError = new Error('Network connection lost');
      axios.get.mockRejectedValue(networkError);

      await expect(handler({ args: baseValidArgs })).rejects.toThrow('Network connection lost');
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

    ['baseUrl', 'consumerKey', 'consumerSecret'].forEach(field => {
      it(`should throw Zod validation error if ${field} is missing`, async () => {
        const incompleteArgs = { ...baseValidArgs };
        delete incompleteArgs[field];
        await expectZodError(incompleteArgs, "Required");
      });
    });

    it('should throw Zod validation error if baseUrl is invalid', async () => {
      await expectZodError({ ...baseValidArgs, baseUrl: 'not-a-valid-url' }, "Invalid WooCommerce base URL");
    });

    ['consumerKey', 'consumerSecret'].forEach(field => {
         it(`should throw Zod validation error if ${field} is an empty string`, async () => {
            const expectedMessage = `WooCommerce ${field === 'consumerKey' ? 'Consumer Key' : 'Consumer Secret'} is required`;
            await expectZodError({ ...baseValidArgs, [field]: "" }, expectedMessage);
        });
    });

    it('should throw Zod validation error if productId is 0', async () => {
      await expectZodError({ ...baseValidArgs, productId: 0 }, "Product ID must be a positive integer");
    });

    it('should throw Zod validation error if productId is an empty string', async () => {
      await expectZodError({ ...baseValidArgs, productId: "" }, "Product ID cannot be empty if a string");
    });

    it('should accept valid productId (number) and search (empty string) together - productId takes precedence', async () => {
      const mockProductId = 101;
      const args = { ...baseValidArgs, productId: mockProductId, search: '' };
      const mockProduct = { id: mockProductId, name: 'Awesome T-Shirt', price: '25.00' };
      axios.get.mockResolvedValue({ data: mockProduct });

      await handler({ args });
      expect(axios.get).toHaveBeenCalledWith(
        `${mockBaseUrl}/wp-json/wc/v3/products/${mockProductId}`,
        expect.objectContaining({ params: undefined })
      );
    });
  });
});
