// handlers/wordpress/getUsers.test.js
const { handler, ArgsSchema, ConnectionSchema } = require('./getUsers'); // Updated to import ConnectionSchema
const axios = require('axios');

jest.mock('axios');

const mockBaseUrl = 'https://yourwordpress.site';
const mockToken = 'test_wordpress_token';

describe('WordPress getUsers Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  const validAuth = { baseUrl: mockBaseUrl, token: mockToken }; // This structure is compatible with ConnectionSchema
  const mockUserListResponse = [
    { id: 1, name: 'Admin User', slug: 'admin', email: 'admin@example.com' },
    { id: 2, name: 'Editor Bob', slug: 'editorbob' }
  ];

  it('should fetch users with no filters (e.g., all viewable users)', async () => {
    axios.get.mockResolvedValue({ data: mockUserListResponse });
    const result = await handler({ args: {}, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wp/v2/users`,
      {
        params: {},
        headers: {
          'Authorization': `Bearer ${mockToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    expect(result).toEqual(mockUserListResponse);
  });

  it('should fetch users using email as search term', async () => {
    const args = { email: 'user@example.com' };
    const filteredResponse = [ {id: 3, name: 'User Example', slug: 'user', email: 'user@example.com'} ];
    axios.get.mockResolvedValue({ data: filteredResponse });
    await handler({ args, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wp/v2/users`,
      expect.objectContaining({
        params: { search: 'user@example.com' },
        headers: {
          'Authorization': `Bearer ${mockToken}`,
          'Content-Type': 'application/json',
        },
      })
    );
  });

  it('should fetch users with a general search term', async () => {
    const args = { search: 'SpecificUser' };
    axios.get.mockResolvedValue({ data: [mockUserListResponse[0]] });
    await handler({ args, auth: validAuth });

    expect(axios.get).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wp/v2/users`,
      expect.objectContaining({
        params: { search: 'SpecificUser' },
        headers: {
          'Authorization': `Bearer ${mockToken}`,
          'Content-Type': 'application/json',
        },
      })
    );
  });

  it('should prioritize email for search if both email and search are provided', async () => {
    const args = { email: 'onlyemail@example.com', search: 'this_is_ignored' };
    axios.get.mockResolvedValue({ data: [] });
    await handler({ args, auth: validAuth });
    expect(axios.get).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wp/v2/users`,
      expect.objectContaining({
        params: { search: 'onlyemail@example.com' },
        headers: {
          'Authorization': `Bearer ${mockToken}`,
          'Content-Type': 'application/json',
        },
      })
    );
  });


  it('should throw specific error for 401/403 WordPress API authorization issues', async () => {
    const apiError = new Error('Auth Error');
    apiError.response = { status: 401, data: { message: 'Invalid token.' } };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: {}, auth: validAuth })).rejects.toThrow('WordPress API Authorization Error: Invalid token.');
  });

  it('should throw an error if WordPress API call fails with other errors', async () => {
    const apiError = new Error('WP API Error');
    apiError.response = { data: { message: 'Some other WP error.' } };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: {}, auth: validAuth })).rejects.toThrow('WordPress API Error: Some other WP error.');
  });

  it('should throw an error if no response received from WordPress API', async () => {
    const networkError = new Error('Network issue');
    networkError.request = {};
    axios.get.mockRejectedValue(networkError);

    await expect(handler({ args: {}, auth: validAuth }))
      .rejects.toThrow('No response received from WordPress API when fetching users. Check network connectivity.');
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
      axios.get.mockResolvedValue({ data: mockUserListResponse });
      await expect(handler({ args: {}, auth: validAuth })).resolves.toEqual(mockUserListResponse);
    });

    it('should throw Zod error for invalid email format in args', async () => {
      await expectZodError({ email: 'not-an-email' }, validAuth, "Invalid email format.");
    });

    it('should throw Zod error if baseUrl is missing in auth', async () => {
      await expectZodError({}, { token: mockToken }, "Required", true);
    });

    it('should throw Zod error if baseUrl is invalid in auth', async () => {
      await expectZodError({}, { baseUrl: 'invalid-url', token: mockToken }, "WordPress base URL is required.");
    });

    it('should throw Zod error if token is missing in auth', async () => {
      await expectZodError({}, { baseUrl: mockBaseUrl }, "Required", true);
    });

    it('should throw Zod error if token is an empty string in auth', async () => {
      await expectZodError({}, { baseUrl: mockBaseUrl, token: "" }, "WordPress authentication token (e.g., Application Password) is required.");
    });
  });
});
