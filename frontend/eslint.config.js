import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// Motion boundary (Requirements 9.1, 9.12): GSAP and Motion's imperative `animate` live only in src/animation/**.
const motionBoundary = {
  paths: [
    {
      name: "gsap",
      message: "Import gsap only inside src/animation/**.",
    },
    {
      name: "motion",
      importNames: ["animate"],
      message: "Import animate from motion only inside src/animation/**.",
    },
    {
      name: "motion/react",
      importNames: ["animate"],
      message: "Import animate from motion only inside src/animation/**.",
    },
  ],
  patterns: [
    {
      group: ["gsap/*"],
      message: "Import gsap plugins only inside src/animation/**.",
    },
  ],
};

export default tseslint.config(
  { ignores: ["dist", "assets", "node_modules", "playwright-report", "test-results", ".lighthouseci"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": ["error", motionBoundary],
    },
  },
  {
    files: ["src/animation/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["*.config.{ts,js}"],
    languageOptions: { globals: globals.node },
  },
);
