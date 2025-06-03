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
  const details = {};

  // Function to process the actual shape of a ZodObject
  function processShape(shape) {
    const currentDetails = {};
    for (const key in shape) {
      const field = shape[key];
      if (field && field._def && field._def.typeName) {
        let typeName = field._def.typeName;

        // Simplified type name generation for compatibility
        // This tries to match the old format more closely.
        if (typeName === 'ZodOptional' && field._def.innerType && field._def.innerType._def) {
          typeName = `Optional<${field._def.innerType._def.typeName}>`; // Or just innerType._def.typeName if "<>" breaks clients
        } else if (typeName === 'ZodNullable' && field._def.innerType && field._def.innerType._def) {
          typeName = `Nullable<${field._def.innerType._def.typeName}>`; // Same as above
        } else if (typeName === 'ZodEffects' && field._def.schema && field._def.schema._def) {
           // If it's an effect on an object, try to describe the object, otherwise just the effect type or wrapped type
           if (field._def.schema._def.typeName === 'ZodObject') {
               // This would be a nested object. For strict flatness, might just say "ZodObject" or "ProcessedZodObject".
               // For now, let's be simple. The original plan was to stay flat.
               // So, if a field is an object, it's "ZodObject".
               // This part needs careful thought for full compatibility.
               // The original function only iterated the *top-level* schema if it was an object.
               // It did not recursively call for nested objects.
               // Let's stick to the original function's behavior for direct ZodObject fields for now.
               typeName = field._def.schema._def.typeName; // e.g. ZodObject if it's a passthrough on an object
           } else {
               typeName = `Effects<${field._def.schema._def.typeName}>`;
           }
        } else if (typeName === 'ZodArray' && field._def.type && field._def.type._def) {
            typeName = `Array<${field._def.type._def.typeName}>`;
        } else if (typeName === 'ZodUnion' && field._def.options) {
            const unionTypes = field._def.options.map(opt => opt._def.typeName).join(' | ');
            typeName = `Union<${unionTypes}>`;
        } else if (typeName === 'ZodEnum' && field._def.values) {
          typeName = `Enum<[${field._def.values.join(', ')}]>`;
        }
        // For ZodObject fields, the original function would not detail its shape here,
        // it would just say 'ZodObject'.
        if (field._def.typeName === 'ZodObject'){
            currentDetails[key] = 'ZodObject';
        } else {
            currentDetails[key] = typeName;
        }

      } else {
        currentDetails[key] = 'UnknownZodType';
      }
    }
    return currentDetails;
  }

  let schemaToProcess = zodSchema;

  // Unwrap common wrappers to get to the core schema, especially if it's an object
  if (zodSchema && zodSchema._def) {
    const typeName = zodSchema._def.typeName;
    if ((typeName === 'ZodOptional' || typeName === 'ZodNullable') && zodSchema._def.innerType) {
      schemaToProcess = zodSchema._def.innerType;
    } else if (typeName === 'ZodEffects' && zodSchema._def.schema) {
      // Further unwrap if ZodEffects wraps another ZodEffects (e.g. .passthrough().nullable())
      let currentSchema = zodSchema._def.schema;
      while (currentSchema._def && currentSchema._def.typeName === 'ZodEffects' && currentSchema._def.schema) {
          currentSchema = currentSchema._def.schema;
      }
      schemaToProcess = currentSchema;
    }
  }

  // Now, if schemaToProcess is a ZodObject, process its shape.
  if (schemaToProcess && schemaToProcess._def && schemaToProcess._def.typeName === 'ZodObject' && typeof schemaToProcess.shape === 'object' && schemaToProcess.shape !== null) {
    return processShape(schemaToProcess.shape);
  } else if (schemaToProcess && schemaToProcess._def) {
    // This section handles non-ZodObject top-level schemas (after unwrapping).
    // For backward compatibility with the original problem (empty {} for non-objects),
    // we should return `details` which is `{}` at this point.
    // However, if the goal is to provide *some* info for top-level non-objects
    // that were previously becoming blank due to incorrect unwrapping,
    // this is where that would be handled. The provided code implies returning `details` (empty object).
  }

  return details; // This will be {} if not a ZodObject with a shape after unwrapping
}

function generateSamplePayload(schemaDetails) {
  const payload = {};
  for (const key in schemaDetails) {
    const type = schemaDetails[key];
    if (type.startsWith('ZodString') || type.includes('ZodString') || type.includes('Optional<ZodString>') || type.includes('Nullable<ZodString>')) {
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
    } else if (type.startsWith('ZodNumber') || type.includes('ZodNumber') || type.includes('Optional<ZodNumber>') || type.includes('Nullable<ZodNumber>')) {
      payload[key] = 123;
    } else if (type.startsWith('ZodBoolean') || type.includes('ZodBoolean') || type.includes('Optional<ZodBoolean>') || type.includes('Nullable<ZodBoolean>')) {
      payload[key] = true;
    } else if (type.startsWith('ZodObject') || type.includes('ZodObject')) { // Simple check, no deep nesting for sample
      payload[key] = { /* sample_sub_field: "value" */ };
    } else if (type.startsWith('Array') || type.startsWith('ZodArray') || type.includes('ZodArray')) {
      payload[key] = [ /* sample_element */ ];
    } else if (type.startsWith('Enum') || type.startsWith('ZodEnum') || type.includes('ZodEnum')) {
      const match = type.match(/Enum<\[([^,]+).*\]>/);
      payload[key] = match ? match[1] : 'enum_value';
    } else if (type.startsWith('Union') || type.startsWith('ZodUnion')) {
        payload[key] = "selected_union_option_value"; // Placeholder for union
    } else {
      payload[key] = `sample_for_${type.replace(/[<>]/g, '_')}`; // Generic placeholder
    }
  }
  return payload;
}

module.exports = {
  toTitleCase,
  getZodSchemaDetails,
  generateSamplePayload,
};
