import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import vue from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";

export default tseslint.config(
  {
    ignores: [
      "example/**",
      "OLD/**",
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "public/media/**",
      "content/mdx/**",
      "server/generated/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs["flat/recommended"],
  {
    files: ["src/**/*.{ts,vue}", "vite.config.ts"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: "latest",
        sourceType: "module"
      },
      globals: globals.browser
    },
    rules: {
      "vue/max-attributes-per-line": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/html-self-closing": "off",
      "vue/attributes-order": "off",
      "vue/no-v-html": "off"
    }
  },
  {
    files: ["server/**/*.{js,mjs}", "scripts/**/*.{js,mjs}"],
    languageOptions: {
      globals: globals.node
    }
  }
);
