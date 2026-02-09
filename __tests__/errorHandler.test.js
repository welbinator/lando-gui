const { AppError, asyncHandler } = require('../middleware/errorHandler');

describe('Error Handler Middleware', () => {
  describe('AppError', () => {
    test('creates error with default status 500', () => {
      const error = new AppError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
    });

    test('creates error with custom status code', () => {
      const error = new AppError('Not found', 404);
      expect(error.statusCode).toBe(404);
    });

    test('creates error with details', () => {
      const details = { field: 'name', reason: 'invalid' };
      const error = new AppError('Validation error', 400, details);
      expect(error.details).toEqual(details);
    });
  });

  describe('asyncHandler', () => {
    test('passes successful results through', async () => {
      const mockReq = {};
      const mockRes = { json: jest.fn() };
      const mockNext = jest.fn();

      const handler = asyncHandler(async (req, res) => {
        res.json({ success: true });
      });

      await handler(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('catches and forwards errors to next()', async () => {
      const mockReq = {};
      const mockRes = {};
      const mockNext = jest.fn();
      const testError = new Error('Test error');

      const handler = asyncHandler(async () => {
        throw testError;
      });

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(testError);
    });

    test('catches async errors', async () => {
      const mockReq = {};
      const mockRes = {};
      const mockNext = jest.fn();
      const testError = new Error('Async error');

      const handler = asyncHandler(async () => {
        throw testError;
      });

      await handler(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockNext.mock.calls[0][0]).toBe(testError);
    });
  });
});
