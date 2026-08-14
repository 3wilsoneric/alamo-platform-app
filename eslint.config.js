import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/**",
      "generated/**",
      "node_modules/**",
      "public/**"
    ]
  },
  {
    files: ["api/**/*.js", "api/**/*.mjs", "server/**/*.mjs", "shared/**/*.mjs", "scripts/**/*.mjs"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        varsIgnorePattern: "^_"
      }]
    }
  }
];
