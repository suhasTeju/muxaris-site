import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/cdk.out/**",
      "**/node_modules/**",
      "**/*.d.ts",
      // Git-ignored agent scratch (design-bundle copies); never part of the build.
      ".superpowers/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }] } },
  {
    // Dev preview code (fixtures, DevAppFrame, /dev routes) is development-only. Production code
    // must never import it; tests may.
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: ["apps/web/src/app/dev/**", "apps/web/src/components/dev/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/components/dev",
                "@/components/dev/**",
                "@/app/dev",
                "@/app/dev/**",
                "**/components/dev/**",
                "**/app/dev/**",
                // Relative imports (`../dev/fixtures`, `./dev/DevAppFrame`) and any fixtures file.
                "./dev",
                "./dev/**",
                "**/dev",
                "**/dev/**",
                "**/fixtures",
                "**/fixtures.*",
                "**/fixture-*",
              ],
              message: "Dev preview code is development-only; pass data as props instead.",
            },
          ],
        },
      ],
      // Preview-only props on production components: dev previews and tests may pass them.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name='AppointmentsBoard'] > JSXAttribute[name.name=/^(now|initialDialog)$/]",
          message:
            "`now` and `initialDialog` are preview-only AppointmentsBoard props; production uses the real clock and opens no dialog on load.",
        },
      ],
    },
  },
  prettier,
);
