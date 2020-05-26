module.exports = {
  env: {
    browser: true,
    es6: true
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  globals: {
    Atomics: "readonly",
    SharedArrayBuffer: "readonly"
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaFeatures: {
      jsx: true
    },
    ecmaVersion: 2018,
    sourceType: "module"
  },
  overrides: [
    {
      files: ["**/*.tsx"],
      env: {
        jest: true
      },
      extends: ["plugin:react/recommended"],
      plugins: ["react"]
    },
    {
      files: ["**/*.test.{ts,tsx}"],
      env: {
        jest: true
      },
      extends: ["plugin:jest/recommended"],
      plugins: ["jest"]
    }
  ],
  rules: {
    curly: "error"
  }
};