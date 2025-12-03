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
    if (sanitized[key] === '') {
      sanitized[key] = undefined as any;
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null && !Array.isArray(sanitized[key])) {
      sanitized[key] = sanitizeEmptyStrings(sanitized[key]);
    }
  }
  return sanitized;
};
