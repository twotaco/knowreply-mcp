function toTitleCase(str) {
  if (!str) return '';
  // Handle potential kebab-case first by replacing hyphens with spaces
  str = str.replace(/-/g, ' ');
  // Add a space before capital letters (for camelCase), then capitalize first letter of each word.
  return str
    .replace(/([A-Z])/g, ' $1') // Add space before capitals
    .replace(/^./, (s) => s.toUpperCase()) // Capitalize first letter
    .trim() // Remove leading/trailing spaces
    .replace(/\s+/g, ' ') // Normalize multiple spaces to one
    .replace(/\b[a-z]/g, (char) => char.toUpperCase()); // Capitalize each word
}

function getZodSchemaDetails(zodSchema) {
  if (!zodSchema || !zodSchema._def || !zodSchema._def.typeName) {
    // This case might occur if a schema is undefined or not a Zod schema.
    // For example, if an OutputSchema is accidentally exported as null.
    return { type: 'InvalidOrUndefinedSchema' };
  }

  const typeName = zodSchema._def.typeName;

  switch (typeName) {
    case 'ZodObject':
      const shapeDetails = {};
      if (zodSchema.shape) { // Ensure shape exists
          for (const key in zodSchema.shape) {
            shapeDetails[key] = getZodSchemaDetails(zodSchema.shape[key]);
          }
      }
      // Add description if available on the object schema itself
      const description = zodSchema._def.description;
      return { type: 'ZodObject', shape: shapeDetails, ...(description && { description }) };
    case 'ZodString':
    case 'ZodNumber':
    case 'ZodBoolean':
    case 'ZodDate':
    case 'ZodAny':
    case 'ZodUnknown':
    case 'ZodVoid':
    case 'ZodNull':
    case 'ZodUndefined':
    case 'ZodBigInt': {
      const desc = zodSchema._def.description;
      // We could also extract checks like min/max for strings/numbers if needed later
      return { type: typeName, ...(desc && { description: desc }) };
    }
    case 'ZodLiteral': {
      const desc = zodSchema._def.description;
      return { type: 'ZodLiteral', value: zodSchema._def.value, ...(desc && { description: desc }) };
    }
    case 'ZodEnum': {
      const desc = zodSchema._def.description;
      return { type: 'ZodEnum', values: zodSchema._def.values, ...(desc && { description: desc }) };
    }
    case 'ZodNativeEnum': {
      const desc = zodSchema._def.description;
      // Attempt to get values; this might vary based on how the native enum is defined
      const values = zodSchema._def.values ? Object.values(zodSchema._def.values) : "Unknown native enum values";
      return { type: 'ZodNativeEnum', values: values, ...(desc && { description: desc }) };
    }
    case 'ZodOptional':
    case 'ZodNullable': {
      const desc = zodSchema._def.description; // Description might be on the wrapper or inner type
      return {
        type: typeName,
        inner: getZodSchemaDetails(zodSchema._def.innerType),
        ...(desc && { description: desc })
      };
    }
    case 'ZodArray': {
      const desc = zodSchema._def.description;
      return {
        type: 'ZodArray',
        element: getZodSchemaDetails(zodSchema._def.type), // .type for ZodArray element schema
        ...(desc && { description: desc })
      };
    }
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion': { // ZodDiscriminatedUnion might need more specific handling for its discriminator
      const desc = zodSchema._def.description;
      return {
        type: typeName,
        options: zodSchema._def.options.map(opt => getZodSchemaDetails(opt)),
        ...(desc && { description: desc })
      };
    }
    case 'ZodRecord': {
      const desc = zodSchema._def.description;
      return {
        type: 'ZodRecord',
        key: getZodSchemaDetails(zodSchema._def.keyType),
        value: getZodSchemaDetails(zodSchema._def.valueType),
        ...(desc && { description: desc })
      };
    }
    case 'ZodEffects': { // Handles .passthrough(), .refine(), .transform() etc.
      const desc = zodSchema._def.description;
      // The actual effect type (e.g., 'refinement', 'transform', 'preprocess') might be useful
      // let effectType = zodSchema._def.effect ? zodSchema._def.effect.type : 'unknown';
      return {
        type: 'ZodEffects',
        // effect: effectType,
        schema: getZodSchemaDetails(zodSchema._def.schema),
        ...(desc && { description: desc })
      };
    }
    case 'ZodDefault': { // Handle schemas with .default()
        const desc = zodSchema._def.description;
        return {
            type: 'ZodDefault',
            inner: getZodSchemaDetails(zodSchema._def.innerType),
            defaultValue: zodSchema._def.defaultValue(), // Execute to get default value
            ...(desc && { description: desc })
        };
    }
    // Add cases for other Zod types as encountered/needed e.g. ZodTuple, ZodIntersection, ZodLazy, etc.
    default: {
      const desc = zodSchema._def.description;
      return { type: typeName, message: 'Unhandled Zod type in getZodSchemaDetails', ...(desc && { description: desc }) };
    }
  }
}

function generateSamplePayload(schemaDetails) {
  const payload = {};
  for (const key in schemaDetails) {
    const type = schemaDetails[key];
    if (type.startsWith('ZodString') || type.includes('ZodString')) {
      if (key.toLowerCase().includes('email')) {
        payload[key] = 'user@example.com';
      } else if (key.toLowerCase().includes('id')) {
        payload[key] = 'identifier_123';
      } else if (key.toLowerCase().includes('time') || key.toLowerCase().includes('date')) {
        payload[key] = new Date().toISOString();
      }
      else {
        payload[key] = 'string_value';
      }
    } else if (type.startsWith('ZodNumber') || type.includes('ZodNumber')) {
      payload[key] = 123;
    } else if (type.startsWith('ZodBoolean') || type.includes('ZodBoolean')) {
      payload[key] = true;
    } else if (type.startsWith('ZodObject') || type.includes('ZodObject')) {
      payload[key] = { /* add sample sub-fields if necessary or leave empty */ };
    } else if (type.startsWith('ZodArray') || type.includes('ZodArray')) {
      payload[key] = [];
    } else if (type.startsWith('ZodEnum') || type.includes('ZodEnum')) {
      // Extract first value from enum type string e.g. "ZodEnum<[new, open]>"
      const match = type.match(/ZodEnum<\[([^,]+).*\]>/);
      payload[key] = match ? match[1] : 'enum_value';
    } else {
      payload[key] = 'unknown_type_value';
    }
  }
  return payload;
}

module.exports = {
  toTitleCase,
  getZodSchemaDetails,
  generateSamplePayload,
};
