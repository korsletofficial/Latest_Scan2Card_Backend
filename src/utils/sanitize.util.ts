/**
 * Sanitizes empty strings by converting them to undefined
 * This ensures MongoDB doesn't store empty strings which can cause issues with:
 * - ObjectId validation
 * - Search queries
 * - Data consistency
 *
 * @param obj - Object to sanitize
 * @returns Sanitized object with empty strings converted to undefined
 */
export const sanitizeEmptyStrings = <T extends Record<string, any>>(obj: T): T => {
  if (!obj || typeof obj !== 'object') return obj;

  const sanitized = { ...obj };
  for (const key in sanitized) {
    const value = sanitized[key];

    if (value === '') {
      sanitized[key] = undefined as any;
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.prototype.toString.call(value) !== '[object Date]' // Exclude Date objects from recursive sanitization
    ) {
      sanitized[key] = sanitizeEmptyStrings(value);
    }
  }
  return sanitized;
};
