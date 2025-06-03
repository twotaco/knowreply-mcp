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
    return { typeName: 'InvalidOrUndefinedSchema' };
  }

  const definition = zodSchema._def;
  const typeName = definition.typeName;
  let details = { typeName: typeName };

  // Add description if available
  if (definition.description) {
    details.description = definition.description;
  }

  switch (typeName) {
    case 'ZodObject':
      details.shape = {};
      if (zodSchema.shape) { // Ensure shape exists (it always should for ZodObject)
          for (const key in zodSchema.shape) {
            details.shape[key] = getZodSchemaDetails(zodSchema.shape[key]);
          }
      }
      // Add passthrough status if applicable
      if (definition.catchall && definition.catchall._def.typeName !== 'ZodNever') {
        details.passthrough = true;
      } else {
        details.passthrough = false; // Explicitly state if not passthrough
      }
      break;
    case 'ZodString':
      // Could add checks like min/max, email, url, uuid, etc. from definition.checks
      details.checks = definition.checks ? definition.checks.map(c => ({ kind: c.kind, ...c })) : [];
      break;
    case 'ZodNumber':
      // Could add checks like int, min, max, positive, etc. from definition.checks
      details.checks = definition.checks ? definition.checks.map(c => ({ kind: c.kind, ...c })) : [];
      break;
    case 'ZodBoolean':
    case 'ZodDate':
    case 'ZodAny':
    case 'ZodUnknown':
    case 'ZodVoid':
    case 'ZodNull': // Note: ZodNull is a specific type for `z.null()`
    case 'ZodUndefined':
    case 'ZodBigInt':
      // These types are mostly self-descriptive by their typeName
      break;
    case 'ZodLiteral':
      details.value = definition.value;
      break;
    case 'ZodEnum':
      details.values = definition.values;
      break;
    case 'ZodNativeEnum':
      details.values = definition.values ? Object.values(definition.values) : "Unknown native enum values";
      break;
    case 'ZodOptional':
    case 'ZodNullable':
      details.innerType = getZodSchemaDetails(definition.innerType);
      break;
    case 'ZodDefault':
      details.innerType = getZodSchemaDetails(definition.innerType);
      try {
        details.defaultValue = definition.defaultValue();
      } catch (e) {
        details.defaultValue = "Error evaluating default value";
      }
      break;
    case 'ZodArray':
      details.elementType = getZodSchemaDetails(definition.type); // .type for ZodArray element schema
      // Could add min/max length checks if definition.minLength or definition.maxLength exists
      if (definition.minLength !== null) details.minLength = definition.minLength; // Zod typically uses null for not set
      if (definition.maxLength !== null) details.maxLength = definition.maxLength;
      if (definition.exactLength !== null) details.exactLength = definition.exactLength; // Added for completeness
      break;
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion': // Discriminated union might need more specific handling for its discriminator
      details.options = definition.options.map(opt => getZodSchemaDetails(opt));
      if (typeName === 'ZodDiscriminatedUnion' && definition.discriminator) {
        details.discriminator = definition.discriminator;
      }
      break;
    case 'ZodRecord':
      details.keyType = getZodSchemaDetails(definition.keyType);
      details.valueType = getZodSchemaDetails(definition.valueType);
      break;
    case 'ZodEffects': // Handles .passthrough(), .refine(), .transform() etc.
      // The actual effect type (e.g., 'refinement', 'transform', 'preprocess') might be useful
      details.effectType = definition.effect ? definition.effect.type : 'unknown';
      details.innerType = getZodSchemaDetails(definition.schema); // The schema it's affecting
      break;
    case 'ZodIntersection':
        details.left = getZodSchemaDetails(definition.left);
        details.right = getZodSchemaDetails(definition.right);
        break;
    case 'ZodTuple':
        details.items = definition.items.map(item => getZodSchemaDetails(item));
        break;
    case 'ZodLazy':
        // Handling lazy schemas is complex due to potential recursion.
        // For now, just indicate it's lazy. A full implementation might need cycle detection.
        details.isLazy = true;
        // Attempt to describe what it evaluates to, but be cautious.
        // details.schema = getZodSchemaDetails(definition.getter()); // This could cause infinite loop if not handled carefully
        break;
    // Add cases for other Zod types as encountered/needed
    default:
      details.message = 'Unhandled Zod type in getZodSchemaDetails';
      break;
  }
  return details;
}

function generateSamplePayload(schemaDetails) {
  if (!schemaDetails || !schemaDetails.typeName) {
    return undefined; // Or some indicator of an invalid schema input
  }

  // Handle optional/nullable wrappers first
  if (schemaDetails.typeName === 'ZodOptional') {
    // For sample purposes, we can choose to either include the optional field or not.
    // Let's include it by default, but one could make it random.
    // Or, if it's truly optional and has no default, maybe skip it in sample.
    // For now, let's generate for its inner type.
    if (Math.random() < 0.25) return undefined; // 25% chance of omitting optional field
    return generateSamplePayload(schemaDetails.innerType);
  }
  if (schemaDetails.typeName === 'ZodNullable') {
    // Could randomly return null or the inner type's sample.
    if (Math.random() < 0.25) return null; // 25% chance of being null
    return generateSamplePayload(schemaDetails.innerType);
  }
  if (schemaDetails.typeName === 'ZodDefault') {
    // Prefer the default value for the sample
    try {
        // The defaultValue might be a function, ensure it's called if it is.
        // The new getZodSchemaDetails already calls it.
        return schemaDetails.defaultValue;
    } catch (e) {
        // If default value errors, fall back to inner type
        return generateSamplePayload(schemaDetails.innerType);
    }
  }
  if (schemaDetails.typeName === 'ZodEffects') {
    // Generate sample based on the pre-effect schema (innerType for ZodEffects in the new structure)
    return generateSamplePayload(schemaDetails.innerType);
  }


  switch (schemaDetails.typeName) {
    case 'ZodObject':
      const sampleObject = {};
      if (schemaDetails.shape) {
        for (const key in schemaDetails.shape) {
          const fieldSample = generateSamplePayload(schemaDetails.shape[key]);
          if (fieldSample !== undefined) { // Only include if not explicitly undefined (e.g. omitted optional)
             sampleObject[key] = fieldSample;
          }
        }
      }
      return sampleObject;
    case 'ZodArray':
      // Generate a sample array with one or two elements, or empty if minLength allows
      const minLength = schemaDetails.minLength || 0;
      let numElements = 1;
      if (minLength === 0 && Math.random() < 0.3) numElements = 0;
      else if (minLength <=1 && Math.random() < 0.5) numElements = 1;
      else if (minLength <=2 && Math.random() < 0.7) numElements = 2;
      else numElements = minLength > 0 ? minLength : 1; // Default to 1 if no strong indicator

      if (!schemaDetails.elementType) return []; // Should not happen with valid array schema

      const sampleArray = [];
      for (let i = 0; i < numElements; i++) {
        sampleArray.push(generateSamplePayload(schemaDetails.elementType));
      }
      return sampleArray;
    case 'ZodString':
      // Basic string generation, could be enhanced with checks
      if (schemaDetails.checks && schemaDetails.checks.some(c => c.kind === 'email')) return 'user@example.com';
      if (schemaDetails.checks && schemaDetails.checks.some(c => c.kind === 'url')) return 'https://example.com';
      if (schemaDetails.checks && schemaDetails.checks.some(c => c.kind === 'uuid')) return 'a1b2c3d4-e5f6-7890-1234-567890abcdef';
      if (schemaDetails.checks && schemaDetails.checks.some(c => c.kind === 'datetime')) return new Date().toISOString();
      let minStrLength = schemaDetails.checks && schemaDetails.checks.find(c => c.kind === 'min');
      minStrLength = minStrLength ? minStrLength.value : 3;
      // Ensure the sample string meets the minimum length if specified.
      let sampleStr = 'sample_string';
      if (sampleStr.length < minStrLength) {
        sampleStr = sampleStr.padEnd(minStrLength, '_');
      }
      return sampleStr;
    case 'ZodNumber':
      let minNum = schemaDetails.checks && schemaDetails.checks.find(c => c.kind === 'min');
      minNum = minNum ? minNum.value : 1;
      // Consider if it should be an integer
      const isInt = schemaDetails.checks && schemaDetails.checks.some(c => c.kind === 'int');
      let randomAdd = Math.random() * 100;
      if (isInt) randomAdd = Math.floor(randomAdd);
      return minNum + randomAdd;
    case 'ZodBoolean':
      return Math.random() < 0.5;
    case 'ZodDate':
      return new Date().toISOString(); // Return as ISO string, common for JSON payloads
    case 'ZodEnum':
    case 'ZodNativeEnum':
      return schemaDetails.values && schemaDetails.values.length > 0 ? schemaDetails.values[0] : 'enum_value';
    case 'ZodLiteral':
      return schemaDetails.value;
    case 'ZodUnion':
      // For sample, pick the first option, could be randomized
      return schemaDetails.options && schemaDetails.options.length > 0 ? generateSamplePayload(schemaDetails.options[0]) : undefined;
    case 'ZodDiscriminatedUnion':
      // More complex, ideally pick based on discriminator, for now, first option
       return schemaDetails.options && schemaDetails.options.length > 0 ? generateSamplePayload(schemaDetails.options[0]) : undefined;
    case 'ZodRecord':
        const keySample = generateSamplePayload(schemaDetails.keyType) || "sampleKey";
        const valueSample = generateSamplePayload(schemaDetails.valueType);
        const recordSample = {};
        recordSample[String(keySample)] = valueSample;
        return recordSample;
    case 'ZodTuple':
        return schemaDetails.items ? schemaDetails.items.map(item => generateSamplePayload(item)) : [];
    case 'ZodAny':
      return { anyValue: "any_sample" };
    case 'ZodUnknown':
      return { unknownValue: "unknown_sample" };
    case 'ZodNull':
        return null;
    case 'ZodLazy':
        return { lazySample: "Sample for lazy schema (actual structure not generated)"};
    case 'InvalidOrUndefinedSchema':
        return { error: "Schema was invalid or undefined" };
    default:
      return `sample_for_${schemaDetails.typeName}`;
  }
}

module.exports = {
  toTitleCase,
  getZodSchemaDetails,
  generateSamplePayload,
};
