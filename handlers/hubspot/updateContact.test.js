// handlers/hubspot/updateContact.test.js
// const { handler, ArgsSchema, ConnectionSchema } = require('./updateContact'); // Moved into beforeEach
let handler; // Will be set in beforeEach

// No axios mock needed as it's a mock handler

const mockApiKey = 'mock_hubspot_api_key';

describe('HubSpot updateContact Handler (Mock)', () => {
  const validAuth = { token: mockApiKey };
  const authNoToken = {};

  const baseContactId = "hub_contact_12345";

  const initialContactProperties = { // Define initial state for comparison
    email: "contact@example.com",
    firstname: "Test",
    lastname: "Contact",
    company: "Example Corp",
    lifecyclestage: "customer"
  };

  beforeEach(() => {
    jest.resetModules(); // Clears the Jest module cache
    handler = require('./updateContact').handler; // Re-require the handler for a fresh state (including mock DB)

    // Optionally, explicitly reset the mock DB if it were exported from the handler module
    // For example:
    // const handlerModule = require('./updateContact');
    // handler = handlerModule.handler;
    // if (handlerModule.resetMockDb) { // Assuming an exported reset function
    //   handlerModule.resetMockDb();
    // }
    // Since it's not exported, jest.resetModules() is the primary mechanism.
  });


  it('should successfully update a contact with valid arguments', async () => {
    const args = {
      contactId: baseContactId,
      updates: { firstname: "UpdatedFirst", company: "UpdatedCompany" }
    };
    const result = await handler({ args, auth: validAuth });

    expect(result).toBeDefined();
    expect(result.id).toBe(baseContactId);
    expect(result.updatedProperties).toBeDefined();
    expect(result.updatedProperties.firstname).toBe("UpdatedFirst");
    expect(result.updatedProperties.company).toBe("UpdatedCompany");
    expect(result.updatedProperties.email).toBe(initialContactProperties.email);
    expect(result.updatedAt).toBeDefined();
  });

  it('should work even if no token is provided in auth', async () => {
    const args = {
      contactId: baseContactId,
      updates: { lastname: "NewLastNameFromNoTokenTest" }
    };

    const result = await handler({ args, auth: authNoToken });
    expect(result).toBeDefined();
    expect(result.updatedProperties.lastname).toBe("NewLastNameFromNoTokenTest");
    // Check that other properties are from the initial state of this test's module instance
    expect(result.updatedProperties.firstname).toBe(initialContactProperties.firstname);
  });

  it('should throw "Contact not found" for "hub_contact_nonexistent"', async () => {
    const args = { contactId: "hub_contact_nonexistent", updates: { firstname: "Fail" } };
    await expect(handler({ args, auth: validAuth }))
      .rejects.toThrow("HubSpot Handler Error: Mock HubSpot API Error: Contact not found.");
  });

  it('should throw "Failed to update contact" for "hub_contact_update_error"', async () => {
    const args = { contactId: "hub_contact_update_error", updates: { firstname: "Fail" } };
    await expect(handler({ args, auth: validAuth }))
      .rejects.toThrow("HubSpot Handler Error: Mock HubSpot API Error: Failed to update contact (simulated error).");
  });

  it('should throw a generic "not found for update" for other unknown contact IDs', async () => {
    const unknownId = "unknown_id_123";
    const args = { contactId: unknownId, updates: { firstname: "Fail" } };
    await expect(handler({ args, auth: validAuth }))
      .rejects.toThrow(`HubSpot Handler Error: Mock HubSpot API Error: Contact with ID ${unknownId} not found for update.`);
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
    const validUpdates = { updates: { company: "NewCo" } };

    it('should throw Zod error if contactId is missing', async () => {
      await expectZodError({ updates: validUpdates.updates }, validAuth, "Required", true);
    });
    it('should throw Zod error if contactId is empty', async () => {
      await expectZodError({ contactId: "", ...validUpdates }, validAuth, "Contact ID cannot be empty.", true);
    });
    it('should throw Zod error if updates object is missing', async () => {
      await expectZodError({ contactId: baseContactId }, validAuth, "Required", true);
    });
     it('should accept an empty updates object {} and return initial state', async () => {
      const args = { contactId: baseContactId, updates: {} };
      const result = await handler({ args, auth: validAuth });
      expect(result.id).toBe(baseContactId);
      expect(result.updatedProperties).toEqual(initialContactProperties);
    });

    it('should throw Zod error if token is provided but not a string', async () => {
      await expectZodError({contactId: baseContactId, ...validUpdates }, { token: 123 }, "Expected string, received number");
    });
  });
});
