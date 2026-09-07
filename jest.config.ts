import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
  moduleNameMapper: {
    '@shared/(.*)': '<rootDir>/src/shared/$1',
  },
  testTimeout: 15000,
  setupFilesAfterEnv: ['./test/setup.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.main.json',
    }],
  },
}

export default config
