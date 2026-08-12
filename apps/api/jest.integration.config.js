// Integration tests — real Postgres writes, but ExtractionService/
// EmbeddingsService/QueryAnalyzerService are mocked with fixed responses
// (see the spec file) so no real Gemini API calls happen.
// Requires DATABASE_URL configured and Postgres running.
// Run explicitly with: yarn workspace api test:integration
//
// See jest.config.js for why isolatedModules (in tsconfig.json) and
// maxWorkers matter here.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  maxWorkers: 1,
  testTimeout: 60000,
};