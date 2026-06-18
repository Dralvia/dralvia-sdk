// Flat ESLint config for the Dralvia JavaScript SDK.
import globals from "globals";

export default [
  {
    files: ["src/**/*.js", "test/**/*.mjs", "examples/**/*.js", "*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.builtin,
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-undef": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
    },
  },
];
