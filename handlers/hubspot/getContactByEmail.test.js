// handlers/hubspot/getContactByEmail.test.js
const { handler, ArgsSchema, ConnectionSchema } = require('./getContactByEmail');

// No need to mock axios as the handler uses an internal mock function.

const mockApiKey = 'mock_hubspot_api_key';

describe('HubSpot getContactByEmail Handler (Mock)', () => {
  const validAuth = { token: mockApiKey }; // Token is optional in schema, but we can pass it
  const authNoToken = {}; // Testing with no token (as it's optional in ConnectionSchema)

  it('should return contact data for a known email (contact@example.com)', async () => {
    const args = { email: 'contact@example.com' };
    const result = await handler({ args, auth: validAuth });

    expect(result).toEqual({
      id: "hub_contact_12345",
      email: "contact@example.com",
      name: "Test Contact",
      company: "Example Corp",
      lifecycleStage: "customer"
    });
  });

  it('should return null for an email known to be not found (notfound@example.com)', async () => {
    const args = { email: 'notfound@example.com' };
    const result = await handler({ args, auth: validAuth });
    expect(result).toBeNull();
  });

  it('should return null for any other unspecified email (simulating not found)', async () => {
    const args = { email: 'unknown@example.com' };
    const result = await handler({ args, auth: validAuth });
    expect(result).toBeNull();
  });

  it('should throw an error for a specific error-triggering email (error@example.com)', async () => {
    const args = { email: 'error@example.com' };
    await expect(handler({ args, auth: validAuth })).rejects.toThrow("HubSpot Handler Error: Mock HubSpot API Error: Unable to process this email.");
  });

  it('should work even if no token is provided in auth (as token is optional for mock)', async () => {
    const args = { email: 'contact@example.com' };
    const result = await handler({ args, auth: authNoToken }); // No token
    expect(result).toBeDefined();
    expect(result.email).toBe('contact@example.com');
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
    // ArgsSchema tests
    it('should throw Zod error if email is missing in args', async () => {
      await expectZodError({}, validAuth, "Required", true); // Email is required in ArgsSchema
    });
    it('should throw Zod error if email is invalid in args', async () => {
      await expectZodError({ email: 'not-an-email' }, validAuth, "Invalid email format.");
    });

    // ConnectionSchema tests (token is optional)
    // BaseUrl is not part of HubSpot's ConnectionSchema in this mock example.

    // Since token is optional (z.string().optional()), providing no token or an empty auth object is fine.
    // Test if a non-string token causes an error if auth object with token is provided.
    it('should throw Zod error if token is provided but not a string', async () => {
      // The ConnectionSchema is { token: z.string().optional() }
      // If auth = { token: 123 } is passed, it should fail because 123 is not a string.
      await expectZodError({email: 'test@example.com'}, { token: 123 }, "Expected string, received number");
    });

    it('should NOT throw Zod error if token is an empty string (as its optional string)', async () => {
        // An empty string is a valid string. If .min(1) was there, it would fail.
        // Since it's just z.string().optional(), an empty string is a valid value if 'token' key is present.
        const args = { email: 'contact@example.com' };
        await expect(handler({ args, auth: {token: ""} })).resolves.toBeDefined();
    });

    it('should NOT throw Zod error if auth object is empty (token is optional)', async () => {
        const args = { email: 'contact@example.com' };
        await expect(handler({ args, auth: {} })).resolves.toBeDefined();
    });
  });
});
