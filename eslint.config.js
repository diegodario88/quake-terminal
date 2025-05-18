import js from "@eslint/js";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    rules: {},
  },
  prettier,
  {
    ignores: ["eslint.config.js", "dist/**/*", "node_modules/**"],
  },
];
