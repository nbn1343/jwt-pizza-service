import globals from "globals";
import pluginJs from "@eslint/js";
import pluginJest from "eslint-plugin-jest";



/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.jest,
        ...globals.node
      }
    },
    plugins: {
      jest: pluginJest
    },
    rules: {
      ...pluginJest.configs.recommended.rules
    }
  },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
];