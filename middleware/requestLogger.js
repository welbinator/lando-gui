// Request logging middleware
// Logs all incoming requests with timing

const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  console.log(`→ ${req.method} ${req.path}`);
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const icon = status >= 500 ? '✗' : status >= 400 ? '⚠' : '✓';
    
    console.log(`${icon} ${req.method} ${req.path} ${status} ${duration}ms`);
  });
  
  next();
};

module.exports = requestLogger;
