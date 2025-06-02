// Import z from zod directly, it doesn't depend on env mocks
const { z } = require('zod');

// Mock axios at the top level. This will apply to all imports of 'axios'.
jest.mock('axios');

// Declare variables that will be set in beforeEach
let getCustomerByEmail;
let ArgsSchema;
let axios; // To hold the (mocked) axios module

// Mock environment variables
const OLD_ENV = process.env;

beforeEach(() => {
  jest.resetModules(); // Clears the module cache. This is crucial.

  // Restore and set environment variables for each test
  process.env = { ...OLD_ENV };
  process.env.SHOPIFY_API_KEY = 'test_api_key';
  process.env.SHOPIFY_API_PASSWORD = 'test_api_password';
  process.env.SHOPIFY_STORE_DOMAIN = 'test-store.myshopify.com';

  // Require axios AFTER resetting modules and it will get the mock
  axios = require('axios');
  // Ensure axios.get is a Jest mock function for each test run.
  // jest.mock() at the top does this, but being explicit can help if there were issues.
  // If axios itself or its 'get' method were not a function, it would error here.
  if (typeof axios.get !== 'function' || !jest.isMockFunction(axios.get)) {
     // This check is more for debugging; jest.mock() should ensure .get is a mock fn.
     // If this line is ever hit, it means the mocking setup is broken.
     axios.get = jest.fn();
  }


  // Import the handler and schema AFTER environment variables are set and axios is re-mocked
  const getCustomerByEmailModule = require('./getCustomerByEmail');
  getCustomerByEmail = getCustomerByEmailModule.handler;
  ArgsSchema = getCustomerByEmailModule.ArgsSchema;
});

afterAll(() => {
  process.env = OLD_ENV; // Restore old environment
});

describe('getCustomerByEmail Shopify Handler', () => {
  it('should return customer data for a valid email', async () => {
    const mockEmail = 'test@example.com';
    const mockCustomerDataResponse = { // This is what axios.get resolves to
      data: { // This is the 'data' property within the axios response
        customers: [{
          id: 12345,
          first_name: 'Test',
          last_name: 'User',
          email: mockEmail,
          phone: '1234567890',
          addresses: [],
          tags: 'VIP',
          total_spent: '100.00',
          orders_count: 2,
        }],
      }
    };
    axios.get.mockResolvedValue(mockCustomerDataResponse);

    const result = await getCustomerByEmail({ args: { email: mockEmail } });

    expect(axios.get).toHaveBeenCalledWith(
      `https://test-store.myshopify.com/admin/api/2025-04/customers/search.json?query=email:${encodeURIComponent(mockEmail)}`,
      expect.objectContaining({
        headers: {
          'Authorization': expect.stringContaining('Basic '),
          'Content-Type': 'application/json',
        }
      })
    );
    expect(result).toEqual({
      id: 12345,
      firstName: 'Test',
      lastName: 'User',
      email: mockEmail,
      phone: '1234567890',
      addresses: [],
      tags: 'VIP',
      totalSpent: '100.00',
      numberOfOrders: 2,
    });
  });

  it('should return null if no customer is found', async () => {
    const mockEmail = 'notfound@example.com';
    axios.get.mockResolvedValue({ data: { customers: [] } }); // Correct mock for this case

    const result = await getCustomerByEmail({ args: { email: mockEmail } });
    expect(result).toBeNull();
  });

  it('should throw an error if the Shopify API call fails (generic error)', async () => {
    const mockEmail = 'error@example.com';
    axios.get.mockRejectedValue(new Error('Shopify API Error')); // Generic error

    // The handler should use the .message of this error
    await expect(getCustomerByEmail({ args: { email: mockEmail } })).rejects.toThrow('Shopify API Error');
  });
  
  it('should throw a validation error for an invalid email format', async () => {
    const invalidEmail = 'not-an-email';
    try {
      await getCustomerByEmail({ args: { email: invalidEmail } });
      expect(true).toBe(false); 
    } catch (error) {
      expect(error.name).toBe('ZodError');
      expect(error.errors[0].message).toBe('Invalid email address');
    }
  });

  it('should throw a validation error if email is missing', async () => {
    try {
      await getCustomerByEmail({ args: {} });
      expect(true).toBe(false); 
    } catch (error) {
      expect(error.name).toBe('ZodError');
      const emailError = error.errors.find(e => e.path.includes('email'));
      expect(emailError).toBeDefined();
      expect(emailError.message).toBe('Required');
    }
  });

  it('should handle Shopify API specific error messages', async () => {
    const mockEmail = 'specificerror@example.com';
    const shopifyError = { // This is the error object axios might reject with
      response: { // It has a 'response' property
        data: { // which has 'data'
          errors: "Specific Shopify error from API" // which has 'errors'
        }
      }
    };
    axios.get.mockRejectedValue(shopifyError);

    // The handler should extract "Specific Shopify error from API"
    await expect(getCustomerByEmail({ args: { email: mockEmail } })).rejects.toThrow("Specific Shopify error from API");
  });

});
