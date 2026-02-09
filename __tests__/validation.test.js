const { validateSiteName, validateRequired, validateEnum } = require('../middleware/validation');
const { AppError } = require('../middleware/errorHandler');

describe('Validation Middleware', () => {
  describe('validateSiteName', () => {
    test('accepts valid site names', () => {
      expect(validateSiteName('my-site')).toBe('my-site');
      expect(validateSiteName('test123')).toBe('test123');
      expect(validateSiteName('site-name-123')).toBe('site-name-123');
    });

    test('rejects site names with uppercase letters', () => {
      expect(() => validateSiteName('MyFile')).toThrow(AppError);
      expect(() => validateSiteName('MyFile')).toThrow('lowercase');
    });

    test('rejects site names with spaces', () => {
      expect(() => validateSiteName('my site')).toThrow(AppError);
    });

    test('rejects site names with special characters', () => {
      expect(() => validateSiteName('my_site')).toThrow(AppError);
      expect(() => validateSiteName('my.site')).toThrow(AppError);
      expect(() => validateSiteName('my@site')).toThrow(AppError);
    });

    test('rejects site names that are too short', () => {
      expect(() => validateSiteName('a')).toThrow(AppError);
      expect(() => validateSiteName('a')).toThrow('between 2 and 50');
    });

    test('rejects site names that are too long', () => {
      const longName = 'a'.repeat(51);
      expect(() => validateSiteName(longName)).toThrow(AppError);
    });

    test('rejects empty or null site names', () => {
      expect(() => validateSiteName('')).toThrow(AppError);
      expect(() => validateSiteName(null)).toThrow(AppError);
      expect(() => validateSiteName(undefined)).toThrow(AppError);
    });
  });

  describe('validateRequired', () => {
    test('passes when all required fields are present', () => {
      const data = { name: 'test', recipe: 'wordpress' };
      expect(() => validateRequired(data, ['name', 'recipe'])).not.toThrow();
    });

    test('throws when required fields are missing', () => {
      const data = { name: 'test' };
      expect(() => validateRequired(data, ['name', 'recipe'])).toThrow(AppError);
      expect(() => validateRequired(data, ['name', 'recipe'])).toThrow('Missing required fields: recipe');
    });

    test('throws when multiple fields are missing', () => {
      const data = {};
      expect(() => validateRequired(data, ['name', 'recipe'])).toThrow('name, recipe');
    });
  });

  describe('validateEnum', () => {
    test('passes when value is in allowed list', () => {
      const allowed = ['wordpress', 'drupal', 'laravel'];
      expect(() => validateEnum('wordpress', allowed, 'recipe')).not.toThrow();
    });

    test('throws when value is not in allowed list', () => {
      const allowed = ['wordpress', 'drupal', 'laravel'];
      expect(() => validateEnum('joomla', allowed, 'recipe')).toThrow(AppError);
      expect(() => validateEnum('joomla', allowed, 'recipe')).toThrow('Invalid recipe');
    });
  });
});
