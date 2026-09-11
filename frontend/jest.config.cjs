/** Component tests use DOM emulation, not a browser or live backend. */
module.exports = {
  testEnvironment: "jsdom",
  modulePathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
  testMatch: ["<rootDir>/test/**/*.test.tsx", "<rootDir>/test/**/*.test.ts"],
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react-jsx",
          module: "commonjs",
          moduleResolution: "node",
        },
      },
    ],
  },
  clearMocks: true,
};
