/**
 * Jest Configuration for Miyao Music Bot
 * ES Modules support with comprehensive testing setup
 */

export default {
  // Use Node test environment
  testEnvironment: 'node',
  
  // Transform ES modules
  transform: {},
  
  // Module file extensions
  moduleFileExtensions: ['js', 'json'],
  
  // Test match patterns
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  
  // Test path ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/'
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.js',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!**/coverage/**'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Coverage directory
  coverageDirectory: 'coverage',
  
  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Maximum workers
  maxWorkers: '50%',
  
  // Test timeout (5 seconds)
  testTimeout: 5000,
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};
