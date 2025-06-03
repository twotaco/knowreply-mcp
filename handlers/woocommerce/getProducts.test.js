// handlers/woocommerce/getProducts.test.js
const { handler, ArgsSchema, ConnectionSchema } = require('./getProducts'); // Import ConnectionSchema
const axios = require('axios');

jest.mock('axios');

const mockBaseUrl = 'https://teststore.com';
const mockConsumerKey = 'ck_test_key';
const mockConsumerSecret = 'cs_test_secret';

describe('WooCommerce getProducts Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  const validAuth = {
    baseUrl: mockBaseUrl,
    consumerKey: mockConsumerKey,
    consumerSecret: mockConsumerSecret
  };
  const emptyArgs = {}; // For calls with no specific product filters

  // --- Tests for fetching a single product by ID ---
  describe('Fetch Single Product by ID', () => {
    const mockProductId = 101;
    const argsWithProductId = { productId: mockProductId };
    const mockProduct = { id: mockProductId, name: 'Awesome T-Shirt', price: '25.00' };

    it('should fetch a single product by numeric ID', async () => {
      axios.get.mockResolvedValue({ data: mockProduct });
      const result = await handler({ args: argsWithProductId, auth: validAuth });

      expect(axios.get).toHaveBeenCalledWith(
        `${mockBaseUrl}/wp-json/wc/v3/products/${mockProductId}`,
        expect.objectContaining({
          headers: {
            'Authorization': `Basic ${Buffer.from(`${mockConsumerKey}:${mockConsumerSecret}`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
          params: undefined,
        })
      );
      expect(result).toEqual(mockProduct);
    });

    it('should fetch a single product by string ID', async () => {
      const stringProductId = "product_str_102";
      const argsWithStringId = { ...emptyArgs, productId: stringProductId };
      const mockProductString = { id: stringProductId, name: 'Awesome String T-Shirt', price: '26.00' };

      axios.get.mockResolvedValue({ data: mockProductString });
      const result = await handler({ args: argsWithStringId, auth: validAuth });
       expect(axios.get).toHaveBeenCalledWith(
        `${mockBaseUrl}/wp-json/wc/v3/products/${stringProductId}`,
        expect.objectContaining({
          headers: {
            'Authorization': `Basic ${Buffer.from(`${mockConsumerKey}:${mockConsumerSecret}`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
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

      await expect(handler({ args: argsWithProductId, auth: validAuth })).rejects.toThrow(`Product with ID ${mockProductId} not found. Invalid ID.`);
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
      const result = await handler({ args: emptyArgs, auth: validAuth });

      expect(axios.get).toHaveBeenCalledWith(
        `${mockBaseUrl}/wp-json/wc/v3/products`,
        expect.objectContaining({
          headers: {
            'Authorization': `Basic ${Buffer.from(`${mockConsumerKey}:${mockConsumerSecret}`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
          params: undefined,
        })
      );
      expect(result).toEqual(mockProductList);
    });

    it('should list products with a search term', async () => {
      const searchTerm = 'Gadget';
      const argsWithSearch = { search: searchTerm };
      const filteredMockList = [{ id: 201, name: 'Cool Gadget', price: '99.00' }];
      axios.get.mockResolvedValue({ data: filteredMockList });

      const result = await handler({ args: argsWithSearch, auth: validAuth });

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
      const argsWithEmptySearch = { search: '' };
      axios.get.mockResolvedValue({ data: mockProductList });

      await handler({ args: argsWithEmptySearch, auth: validAuth });
      expect(axios.get).toHaveBeenCalledWith(
        `${mockBaseUrl}/wp-json/wc/v3/products`,
        expect.objectContaining({
          params: undefined, // Empty search string is falsy, handler omits it if (search)
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

      await expect(handler({ args: emptyArgs, auth: validAuth })).rejects.toThrow('Some listing error');
    });

    it('should handle generic network errors', async () => {
      const networkError = new Error('Network connection lost');
      axios.get.mockRejectedValue(networkError);

      await expect(handler({ args: emptyArgs, auth: validAuth })).rejects.toThrow('Network connection lost');
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

    // ConnectionSchema tests (auth object)
    it('should throw Zod validation error if baseUrl is missing from auth', async () => {
      const invalidAuth = { consumerKey: mockConsumerKey, consumerSecret: mockConsumerSecret };
      await expectZodError(emptyArgs, invalidAuth, "Required", true);
    });

    it('should throw Zod validation error if baseUrl is invalid in auth', async () => {
      const invalidAuth = { ...validAuth, baseUrl: 'not-a-valid-url' };
      await expectZodError(emptyArgs, invalidAuth, "WooCommerce base URL is required.");
    });

    it('should throw Zod validation error if consumerKey is missing from auth', async () => {
      const invalidAuth = { baseUrl: mockBaseUrl, consumerSecret: mockConsumerSecret };
      await expectZodError(emptyArgs, invalidAuth, "Required", true);
    });

    it('should throw Zod validation error if consumerKey is an empty string in auth', async () => {
      const invalidAuth = { ...validAuth, consumerKey: "" };
      await expectZodError(emptyArgs, invalidAuth, "WooCommerce Consumer Key is required.");
    });

    it('should throw Zod validation error if consumerSecret is missing from auth', async () => {
      const invalidAuth = { baseUrl: mockBaseUrl, consumerKey: mockConsumerKey };
      await expectZodError(emptyArgs, invalidAuth, "Required", true);
    });

    it('should throw Zod validation error if consumerSecret is an empty string in auth', async () => {
      const invalidAuth = { ...validAuth, consumerSecret: "" };
      await expectZodError(emptyArgs, invalidAuth, "WooCommerce Consumer Secret is required.");
    });

    // ArgsSchema tests (args object)
    it('should throw Zod validation error if productId is 0 in args', async () => {
      await expectZodError({ productId: 0 }, validAuth, "Product ID must be a positive integer");
    });

    it('should throw Zod validation error if productId is an empty string in args', async () => {
      await expectZodError({ productId: "" }, validAuth, "Product ID cannot be empty if a string");
    });

    it('should accept valid productId (number) and search (empty string) together - productId takes precedence', async () => {
      const mockProductId = 101;
      const args = { productId: mockProductId, search: '' }; // search will be ignored due to productId
      const mockProduct = { id: mockProductId, name: 'Awesome T-Shirt', price: '25.00' };
      axios.get.mockResolvedValue({ data: mockProduct });

      await handler({ args, auth: validAuth });
      expect(axios.get).toHaveBeenCalledWith(
        `${mockBaseUrl}/wp-json/wc/v3/products/${mockProductId}`,
        expect.objectContaining({ params: undefined })
      );
    });

    it('should accept empty args (all product filters optional)', async () => {
        axios.get.mockResolvedValue({data: []});
        await expect(handler({args: emptyArgs, auth: validAuth})).resolves.not.toThrow();
    });
  });
});
