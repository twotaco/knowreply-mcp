// handlers/hubspot/getTicketStatus.test.js
const { handler, ArgsSchema, ConnectionSchema } = require('./getTicketStatus');

// No axios mock needed as it's a mock handler

const mockApiKey = 'mock_hubspot_api_key';

describe('HubSpot getTicketStatus Handler (Mock)', () => {
  const validAuth = { token: mockApiKey }; // Token is optional in schema, but we can pass it
  const authNoToken = {};

  it('should return ticket data for a known ticket ID (hub_ticket_78901)', async () => {
    const args = { ticketId: 'hub_ticket_78901' };
    const result = await handler({ args, auth: validAuth });

    expect(result).toBeDefined();
    expect(result.id).toBe('hub_ticket_78901');
    expect(result.subject).toBe("Issue with login");
    expect(result.status).toBe("Waiting on customer"); // Based on mock logic and map
    expect(result.pipeline).toBe("Support Pipeline"); // Based on mock logic and map
    expect(result.lastUpdate).toBeDefined();
  });

  it('should return null for a ticket ID known to be not found (hub_ticket_nonexistent)', async () => {
    const args = { ticketId: 'hub_ticket_nonexistent' };
    const result = await handler({ args, auth: validAuth });
    expect(result).toBeNull();
  });

  it('should return null for any other unspecified/unknown ticket ID', async () => {
    const args = { ticketId: 'unknown_ticket_id' };
    const result = await handler({ args, auth: validAuth });
    expect(result).toBeNull();
  });

  it('should throw an error for a specific error-triggering ticket ID (hub_ticket_error)', async () => {
    const args = { ticketId: 'hub_ticket_error' };
    await expect(handler({ args, auth: validAuth }))
      .rejects.toThrow("HubSpot Handler Error: Mock HubSpot API Error: Failed to fetch ticket status.");
  });

  it('should work even if no token is provided in auth (as token is optional for mock)', async () => {
    const args = { ticketId: 'hub_ticket_78901' };
    const result = await handler({ args, auth: authNoToken }); // No token
    expect(result).toBeDefined();
    expect(result.id).toBe('hub_ticket_78901');
  });

  const expectZodError = async (args, auth, expectedMessagePart, isExact = false) => {
      try {
          await handler({ args, auth });
          throw new Error('Handler did not throw an error as expected.');
      } catch (error) {
          expect(error.name).toBe('ZodError');
          const hasMatchingError = error.errors.some(err => isExact ? err.message === expectedMessagePart : err.message.includes(expectedMessagePart));
          expect(hasMatchingError).toBe(true);
      }
  };

  describe('Schema Validation', () => {
    // ArgsSchema tests
    it('should throw Zod error if ticketId is missing in args', async () => {
      await expectZodError({}, validAuth, "Required", true);
    });
    it('should throw Zod error if ticketId is an empty string in args', async () => {
      await expectZodError({ ticketId: '' }, validAuth, "Ticket ID cannot be empty.", true);
    });

    // ConnectionSchema tests (token is optional)
    it('should throw Zod error if token is provided but not a string', async () => {
      await expectZodError({ ticketId: 'valid_id' }, { token: 123 }, "Expected string, received number");
    });

    it('should NOT throw Zod error if token is an empty string (as its optional string)', async () => {
        const result = await handler({ args: { ticketId: 'hub_ticket_78901' }, auth: {token: ""} });
        expect(result.id).toBe('hub_ticket_78901');
    });

    it('should NOT throw Zod error if auth object is empty (token is optional)', async () => {
        const result = await handler({ args: { ticketId: 'hub_ticket_78901' }, auth: {} });
        expect(result.id).toBe('hub_ticket_78901');
    });
  });
});
