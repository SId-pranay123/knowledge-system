// Unit tests only — fast, fully mocked, no external calls (no live DB, no
// Gemini API). This is what `yarn test` runs by default.
//
// isolatedModules is now set in tsconfig.json (ts-jest deprecated passing it
// via jest config directly). It tells the TypeScript compiler to transpile
// each file independently instead of doing full cross-file type-checking —
// without this, ts-jest walks the entire type graph on every run, including
// heavy third-party typings (googleapis has enormous .d.ts files), which can
// exceed Node's default heap size and crash even small, fully-mocked tests.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  maxWorkers: 1,
};