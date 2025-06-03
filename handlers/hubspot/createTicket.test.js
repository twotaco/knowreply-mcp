// handlers/hubspot/createTicket.test.js
const { handler, ArgsSchema, ConnectionSchema } = require('./createTicket');

// No axios mock needed as it's a mock handler

const mockApiKey = 'mock_hubspot_api_key';

describe('HubSpot createTicket Handler (Mock)', () => {
  const validAuth = { token: mockApiKey }; // Token is optional in schema, but we can pass it
  const authNoToken = {}; // Testing with no token (as it's optional in ConnectionSchema)

  const validTicketArgs = {
    subject: "Test Ticket Subject",
    contactId: "hub_contact_123",
    description: "This is a test ticket description."
  };

  it('should successfully create a ticket with valid arguments', async () => {
    const result = await handler({ args: validTicketArgs, auth: validAuth });

    expect(result).toBeDefined();
    expect(result.ticketId).toMatch(/^hub_ticket_mock_/);
    expect(result.subject).toBe(validTicketArgs.subject);
    expect(result.status).toBe("New"); // Based on mock logic
    expect(result.pipeline).toBe("Support Pipeline"); // Based on mock logic
    expect(result.createdAt).toBeDefined();
    // expect(result.description).toBe(validTicketArgs.description); // Uncomment if mock returns description
    // expect(result.contactId).toBe(validTicketArgs.contactId); // Uncomment if mock returns contactId
  });

  it('should work even if no token is provided in auth (as token is optional for mock)', async () => {
    const result = await handler({ args: validTicketArgs, auth: authNoToken });
    expect(result).toBeDefined();
    expect(result.ticketId).toMatch(/^hub_ticket_mock_/);
  });

  it('should throw an error if contactId is "hub_contact_nonexistent"', async () => {
    const argsWithNonexistentContact = { ...validTicketArgs, contactId: "hub_contact_nonexistent" };
    await expect(handler({ args: argsWithNonexistentContact, auth: validAuth }))
      .rejects.toThrow("HubSpot Handler Error: Mock HubSpot API Error: Associated contact not found. Cannot create ticket.");
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
    it('should throw Zod error if subject is missing', async () => {
      const { subject, ...incompleteArgs } = validTicketArgs;
      await expectZodError(incompleteArgs, validAuth, "Required", true);
    });
    it('should throw Zod error if subject is empty', async () => {
      await expectZodError({ ...validTicketArgs, subject: "" }, validAuth, "Ticket subject cannot be empty.", true);
    });

    it('should throw Zod error if contactId is missing', async () => {
      const { contactId, ...incompleteArgs } = validTicketArgs;
      await expectZodError(incompleteArgs, validAuth, "Required", true);
    });
    it('should throw Zod error if contactId is empty', async () => {
      await expectZodError({ ...validTicketArgs, contactId: "" }, validAuth, "Associated contact ID cannot be empty.", true);
    });

    it('should throw Zod error if description is missing', async () => {
      const { description, ...incompleteArgs } = validTicketArgs;
      await expectZodError(incompleteArgs, validAuth, "Required", true);
    });
    it('should throw Zod error if description is empty', async () => {
      await expectZodError({ ...validTicketArgs, description: "" }, validAuth, "Ticket description cannot be empty.", true);
    });

    // ConnectionSchema tests (token is optional)
    it('should throw Zod error if token is provided but not a string', async () => {
      await expectZodError(validTicketArgs, { token: 123 }, "Expected string, received number");
    });

    it('should NOT throw Zod error if token is an empty string (as its optional string)', async () => {
        const result = await handler({ args: validTicketArgs, auth: {token: ""} });
        expect(result.ticketId).toMatch(/^hub_ticket_mock_/);
    });

    it('should NOT throw Zod error if auth object is empty (token is optional)', async () => {
        const result = await handler({ args: validTicketArgs, auth: {} });
        expect(result.ticketId).toMatch(/^hub_ticket_mock_/);
    });
  });
});
