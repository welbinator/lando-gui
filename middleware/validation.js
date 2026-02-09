// Input validation helpers
// Simple validation without adding dependencies

const { AppError } = require('./errorHandler');

// Validate site name (lowercase, alphanumeric + hyphens)
const validateSiteName = (name) => {
  if (!name || typeof name !== 'string') {
    throw new AppError('Site name is required', 400);
  }
  
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new AppError('Site name must contain only lowercase letters, numbers, and hyphens', 400);
  }
  
  if (name.length < 2 || name.length > 50) {
    throw new AppError('Site name must be between 2 and 50 characters', 400);
  }
  
  return name;
};

// Validate required fields
const validateRequired = (data, fields) => {
  const missing = fields.filter(field => !data[field]);
  
  if (missing.length > 0) {
    throw new AppError(`Missing required fields: ${missing.join(', ')}`, 400);
  }
};

// Validate allowed values
const validateEnum = (value, allowedValues, fieldName) => {
  if (!allowedValues.includes(value)) {
    throw new AppError(
      `Invalid ${fieldName}. Allowed values: ${allowedValues.join(', ')}`,
      400
    );
  }
};

module.exports = {
  validateSiteName,
  validateRequired,
  validateEnum
};
