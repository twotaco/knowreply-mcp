// handlers/wordpress/getPosts.test.js
const { handler, ArgsSchema, ConnectionSchema } = require('./getPosts'); // Updated to import ConnectionSchema
const axios = require('axios');

jest.mock('axios');

const mockBaseUrl = 'https://yourwordpress.site';
const mockToken = 'test_wordpress_token';

describe('WordPress getPosts Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  const validAuthBase = { baseUrl: mockBaseUrl }; // Token is optional, compatible with ConnectionSchema
  const mockPostListResponse = [
    { id: 1, title: { rendered: 'Hello World' }, slug: 'hello-world', categories: [10], tags: [20] },
    { id: 2, title: { rendered: 'Another Post' }, slug: 'another-post', categories: [11], tags: [21] }
  ];

  it('should fetch posts with no token and no filters (public posts)', async () => {
    axios.get.mockResolvedValue({ data: mockPostListResponse });
    const result = await handler({ args: {}, auth: validAuthBase });

    expect(axios.get).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wp/v2/posts`,
      {
        params: {},
        headers: { 'Content-Type': 'application/json' },
      }
    );
    expect(result).toEqual(mockPostListResponse);
  });

  it('should fetch posts with a token and search filter', async () => {
    const args = { search: 'Hello' };
    const authWithToken = { ...validAuthBase, token: mockToken };
    const filteredResponse = [mockPostListResponse[0]];
    axios.get.mockResolvedValue({ data: filteredResponse });

    await handler({ args, auth: authWithToken });

    expect(axios.get).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wp/v2/posts`,
      expect.objectContaining({
        params: { search: 'Hello' },
        headers: expect.objectContaining({
            'Authorization': `Bearer ${mockToken}`,
            'Content-Type': 'application/json',
        })
      })
    );
  });

  it('should fetch posts with category ID (number) filter', async () => {
    const args = { categories: 10 };
    axios.get.mockResolvedValue({ data: [mockPostListResponse[0]] });
    await handler({ args, auth: validAuthBase });

    expect(axios.get).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wp/v2/posts`,
      expect.objectContaining({
          params: { categories: '10' },
          headers: { 'Content-Type': 'application/json' }
      })
    );
  });

  it('should fetch posts with category IDs (comma-separated string) filter', async () => {
    const args = { categories: '10,15' };
    axios.get.mockResolvedValue({ data: [mockPostListResponse[0]] });
    await handler({ args, auth: validAuthBase });

    expect(axios.get).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wp/v2/posts`,
      expect.objectContaining({
          params: { categories: '10,15' },
          headers: { 'Content-Type': 'application/json' }
      })
    );
  });

  it('should fetch posts with tag ID (number) and search filters', async () => {
    const args = { tags: 20, search: "World" };
    axios.get.mockResolvedValue({ data: [mockPostListResponse[0]] });
    await handler({ args, auth: validAuthBase });

    expect(axios.get).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wp/v2/posts`,
      expect.objectContaining({
          params: { tags: '20', search: 'World' },
          headers: { 'Content-Type': 'application/json' }
      })
    );
  });

  it('should throw specific error for 401/403 if a token was provided', async () => {
    const apiError = new Error('Auth Error with token');
    apiError.response = { status: 403, data: { message: 'Forbidden for posts.' } };
    axios.get.mockRejectedValue(apiError);
    const authWithToken = { ...validAuthBase, token: mockToken };

    await expect(handler({ args: {}, auth: authWithToken })).rejects.toThrow('WordPress API Authorization Error: Forbidden for posts.');
  });

  it('should throw specific error for 401 if no token was provided (suggests auth needed)', async () => {
    const apiError = new Error('Auth Error no token');
    apiError.response = { status: 401, data: { message: 'Posts require auth.' } };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: {}, auth: validAuthBase })).rejects.toThrow('WordPress API Error: This resource may require authentication. Posts require auth.');
  });

  it('should throw an error if WordPress API call fails with other errors', async () => {
    const apiError = new Error('WP API Post Error');
    apiError.response = { data: { message: 'Some other WP post error.' } };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: {}, auth: validAuthBase })).rejects.toThrow('WordPress API Error: Some other WP post error.');
  });

  const expectZodError = async (args, auth, expectedMessagePart, isExact = false) => { // Added isExact
      try {
          await handler({ args, auth });
          throw new Error('Handler did not throw an error as expected.');
      } catch (error) {
          expect(error.name).toBe('ZodError');
          const foundError = error.errors.find(e => isExact ? e.message === expectedMessagePart : e.message.includes(expectedMessagePart));
          expect(foundError).toBeDefined();
      }
  };

  describe('ArgsSchema and ConnectionSchema Validation', () => { // Updated describe
    it('should accept empty args (all filters optional)', async () => {
      axios.get.mockResolvedValue({ data: mockPostListResponse });
      await expect(handler({ args: {}, auth: validAuthBase })).resolves.toEqual(mockPostListResponse);
    });

    it('should throw Zod error for invalid categories format (not number or csv string)', async () => {
      const customRegexMessage = "Categories must be a positive integer or a comma-separated string of positive integers.";
      await expectZodError({ categories: 'abc' }, validAuthBase, customRegexMessage);
      await expectZodError({ categories: '10,abc' }, validAuthBase, customRegexMessage);
    });

    it('should throw Zod error for invalid tags format', async () => {
      const customRegexMessage = "Tags must be a positive integer or a comma-separated string of positive integers.";
      await expectZodError({ tags: 'xyz' }, validAuthBase, customRegexMessage);
    });

    it('should accept valid categories (single number)', async () => {
        axios.get.mockResolvedValue({ data: [] });
        await expect(handler({ args: {categories: 1}, auth: validAuthBase })).resolves.not.toThrow();
    });

    it('should accept valid tags (comma-separated string)', async () => {
        axios.get.mockResolvedValue({ data: [] });
        await expect(handler({ args: {tags: "1,2"}, auth: validAuthBase })).resolves.not.toThrow();
    });

    it('should throw Zod error if baseUrl is missing in auth', async () => {
      await expectZodError({}, { token: mockToken }, "Required", true);
    });

    it('should throw Zod error if baseUrl is invalid in auth', async () => {
      await expectZodError({}, { baseUrl: 'invalid-url', token: mockToken }, "WordPress base URL is required.");
    });

    it('should NOT throw Zod error if token is missing in auth (token is optional)', async () => {
      axios.get.mockResolvedValue({ data: mockPostListResponse });
      await expect(handler({ args: {}, auth: { baseUrl: mockBaseUrl } })).resolves.toEqual(mockPostListResponse);
    });

    it('should accept empty string token (Zod pass) and not send Authorization header', async () => {
      const authWithEmptyToken = { ...validAuthBase, token: "" };
      axios.get.mockResolvedValue({ data: mockPostListResponse });
      await expect(handler({ args: {}, auth: authWithEmptyToken })).resolves.toEqual(mockPostListResponse);
      expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' } // No Authorization header
        })
      );
    });
  });
});
