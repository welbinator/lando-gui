module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'server.js',
    'config.js',
    'middleware/**/*.js'
  ],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/*.test.js'
  ],
  verbose: true
};
