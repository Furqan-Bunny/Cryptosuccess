const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

const customJestConfig = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
  },
  // A regex instead of a <rootDir> glob: on Windows a checkout path containing a
  // dot-directory (e.g. a git worktree under .claude/) makes the glob match 0 files.
  testRegex: String.raw`[/\\]tests[/\\].*\.test\.tsx?$`,
  // Nested worktrees / agent scratch dirs hold whole copies of the repo.
  modulePathIgnorePatterns: ['<rootDir>/.claude/'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/'],
};

module.exports = createJestConfig(customJestConfig);
