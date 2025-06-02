// handlers/wordpress/getPages.test.js
const { handler, ArgsSchema, AuthSchema } = require('./getPages');
const axios = require('axios');

jest.mock('axios');

const mockBaseUrl = 'https://yourwordpress.site';
const mockToken = 'test_wordpress_token';

describe('WordPress getPages Handler', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  const validAuthBase = { baseUrl: mockBaseUrl }; // Token is optional
  const mockPageListResponse = [
    { id: 10, title: { rendered: 'About Us' }, slug: 'about-us', content: { rendered: '<p>Content</p>' } },
    { id: 12, title: { rendered: 'Contact' }, slug: 'contact', content: { rendered: '<p>Contact page</p>' } }
  ];

  it('should fetch pages with no token and no filters (public pages)', async () => {
    axios.get.mockResolvedValue({ data: mockPageListResponse });
    const result = await handler({ args: {}, auth: validAuthBase }); // No token

    expect(axios.get).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wp/v2/pages`,
      {
        params: {},
        headers: { 'Content-Type': 'application/json' }, // No Authorization header
      }
    );
    expect(result).toEqual(mockPageListResponse);
  });

  it('should fetch pages with a token and search filter', async () => {
    const args = { search: 'About' };
    const authWithToken = { ...validAuthBase, token: mockToken };
    const filteredResponse = [mockPageListResponse[0]];
    axios.get.mockResolvedValue({ data: filteredResponse });
    
    await handler({ args, auth: authWithToken });

    expect(axios.get).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wp/v2/pages`,
      expect.objectContaining({ 
        params: { search: 'About' },
        headers: expect.objectContaining({ 
            'Authorization': `Bearer ${mockToken}`,
            'Content-Type': 'application/json',
        })
      })
    );
  });

  it('should fetch pages with a slug filter (no token)', async () => {
    const args = { slug: 'contact' };
    axios.get.mockResolvedValue({ data: [mockPageListResponse[1]] });
    await handler({ args, auth: validAuthBase });

    expect(axios.get).toHaveBeenCalledWith(
      `${mockBaseUrl}/wp-json/wp/v2/pages`,
      expect.objectContaining({ 
        params: { slug: 'contact' },
        headers: { 'Content-Type': 'application/json' } // No auth
      })
    );
  });

  it('should throw specific error for 401/403 if a token was provided', async () => {
    const apiError = new Error('Auth Error with token');
    apiError.response = { status: 403, data: { message: 'Forbidden with token.' } };
    axios.get.mockRejectedValue(apiError);
    const authWithToken = { ...validAuthBase, token: mockToken };

    await expect(handler({ args: {}, auth: authWithToken })).rejects.toThrow('WordPress API Authorization Error: Forbidden with token.');
  });
  
  it('should throw specific error for 401 if no token was provided (suggests auth needed)', async () => {
    const apiError = new Error('Auth Error no token');
    apiError.response = { status: 401, data: { message: 'Resource requires auth.' } };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: {}, auth: validAuthBase })).rejects.toThrow('WordPress API Error: This page/resource may require authentication. Resource requires auth.');
  });


  it('should throw an error if WordPress API call fails with other errors', async () => {
    const apiError = new Error('WP API Error');
    apiError.response = { data: { message: 'Some other WP page error.' } };
    axios.get.mockRejectedValue(apiError);

    await expect(handler({ args: {}, auth: validAuthBase })).rejects.toThrow('WordPress API Error: Some other WP page error.');
  });

  it('should throw an error if no response received from WordPress API', async () => {
    const networkError = new Error('Network issue');
    networkError.request = {}; 
    axios.get.mockRejectedValue(networkError);
    
    await expect(handler({ args: {}, auth: validAuthBase }))
      .rejects.toThrow('No response received from WordPress API when fetching pages. Check network connectivity.');
  });

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
    it('should accept empty args (all filters optional)', async () => {
      axios.get.mockResolvedValue({ data: mockPageListResponse });
      await expect(handler({ args: {}, auth: validAuthBase })).resolves.toEqual(mockPageListResponse);
    });
    
    it('should throw Zod error if baseUrl is missing in auth', async () => {
      await expectZodError({}, { token: mockToken }, "Required"); 
    });
        
    it('should throw Zod error if baseUrl is invalid in auth', async () => {
      await expectZodError({}, { baseUrl: 'invalid-url', token: mockToken }, "WordPress base URL is required.");
    });

    it('should NOT throw Zod error if token is missing in auth (token is optional)', async () => {
      axios.get.mockResolvedValue({ data: mockPageListResponse }); 
      await expect(handler({ args: {}, auth: { baseUrl: mockBaseUrl } })).resolves.toEqual(mockPageListResponse);
    });
    
    it('should accept empty string token (Zod pass) and not send Authorization header', async () => {
      // Zod schema for token is .string().optional(). It allows an empty string if provided.
      // The handler logic should then treat the empty (falsy) token as if no token was provided.
      const authWithEmptyToken = { ...validAuthBase, token: "" };
      axios.get.mockResolvedValue({ data: mockPageListResponse }); 
      await expect(handler({ args: {}, auth: authWithEmptyToken })).resolves.toEqual(mockPageListResponse);
       expect(axios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' } // No Authorization header
        })
      );
    });
  });
});
