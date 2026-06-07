// Flat config (typescript-eslint). 관대한 규칙: 에러 0, warn 허용. CLAUDE/AGENTS 계약 §6.
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "captures/**",
      "analysis/**",
      "customizations/**",
      "runs/**",
      "test-results/**",
      ".harness/**",
      ".remember/**",
      "public/**",
      "next-env.d.ts",
      "**/*.json",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "prefer-const": "warn",
      "no-empty": "off",
    },
  },
);
