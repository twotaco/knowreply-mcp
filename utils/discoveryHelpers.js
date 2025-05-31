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
  if (zodSchema && typeof zodSchema.shape === 'object' && zodSchema.shape !== null) {
    for (const key in zodSchema.shape) {
      const field = zodSchema.shape[key];
      if (field && field._def && field._def.typeName) {
        let typeName = field._def.typeName;
        // For optional types, it's often ZodOptional { _def: { innerType: ZodString ... } }
        if (typeName === 'ZodOptional' && field._def.innerType && field._def.innerType._def) {
          typeName = `ZodOptional<${field._def.innerType._def.typeName}>`;
        }
        // For enums, list the values: ZodEnum { _def: { values: [...] } }
        if (typeName === 'ZodEnum' && field._def.values) {
          typeName = `ZodEnum<[${field._def.values.join(', ')}]>`;
        }
        // For objects, we might want to indicate it's an object but not recurse deeply for this basic version
        if (typeName === 'ZodObject') {
            // Could potentially call getZodSchemaDetails recursively if we want nested structure later
            // For now, just mark as object.
            // To get sub-keys: Object.keys(field._def.shape())
            typeName = 'ZodObject';
        }
         if (typeName === 'ZodEffects') { // Handle .passthrough() or other effects
            if (field._def.schema && field._def.schema._def && field._def.schema._def.typeName) {
                let innerEffectTypeName = field._def.schema._def.typeName;
                 if (innerEffectTypeName === 'ZodObject') {
                     typeName = 'ZodObject'; // Keep it simple for passthrough objects
                 } else {
                    typeName = `ZodEffects<${innerEffectTypeName}>`;
                 }
            } else {
                typeName = 'ZodEffects';
            }
        }
        details[key] = typeName;
      } else {
        details[key] = 'UnknownZodType';
      }
    }
  }
  return details;
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
