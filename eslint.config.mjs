import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "example/**",
      "OLD/**",
      "node_modules/**",
      ".next/**",
      "dist/**",
      "coverage/**",
      "public/media/**",
      "content/mdx/**",
      "server/generated/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}", "vite.config.ts"],
    languageOptions: {
      globals: globals.browser
    }
  },
  {
    files: ["server/**/*.{js,mjs}", "scripts/**/*.{js,mjs}"],
    languageOptions: {
      globals: globals.node
    }
  }
);
