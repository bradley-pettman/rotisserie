/**
 * ESLint config — DELIBERATELY NARROW.
 *
 * This is NOT a general lint adoption. It exists to make exactly one
 * architectural rule machine-checkable:
 *
 *   A feature module under `app/features/<module>/` must work standalone.
 *   It may import from `~/db/connection`, `~/components/**`, `~/lib/**` and
 *   from itself — but NEVER from a sibling feature module. Only
 *   `app/features/integrations/**` may reach into several feature modules.
 *
 * Every other rule is off on purpose. Flat config enables nothing by default,
 * and no `recommended` preset is spread in here, so the only diagnostic this
 * config can ever emit is the boundary violation below. That is the point: a
 * full ruleset would bury the one finding that matters under hundreds of
 * pre-existing stylistic findings. Adopting broader linting is a separate
 * decision and a separate change — please do not widen this file casually.
 *
 * Plugin choice: `eslint-plugin-import-x` is the maintained fork of
 * `eslint-plugin-import` and ships the same `no-restricted-paths` rule with the
 * same options. We use the fork because upstream `eslint-plugin-import@2.32`
 * declares a peer range that stops at ESLint 9, and npm now reports ESLint 9 as
 * deprecated/unsupported. `import-x` supports ESLint 10.
 *
 * The rule works on RESOLVED absolute paths, so it catches both import spellings
 * used in this repo — the `~/features/...` alias and a relative
 * `../../recipes/...` — rather than pattern-matching the source text.
 */
import path from "node:path";

import tsParser from "@typescript-eslint/parser";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import importX from "eslint-plugin-import-x";

const ROOT = import.meta.dirname;

/**
 * ---------------------------------------------------------------------------
 * THE LIST. Adding a feature module is a one-line edit here — nothing else in
 * this file needs to change. The zones below are generated from this array, so
 * a new module is automatically walled off from every existing one, in both
 * directions, without a combinatorial rewrite.
 * ---------------------------------------------------------------------------
 */
const FEATURE_MODULES = [
  "recipes",
  "meal-plans",
  // Expected soon — uncomment (or add) as each module lands:
  // "grocery",
  // "inventory",
  // "households",
];

/**
 * The single exempt module: the integration layer is where cross-module links
 * are allowed to live, so it is never a restricted target — only a restricted
 * source for everyone else.
 */
const INTEGRATION_MODULE = "integrations";

const moduleDir = (name) => `app/features/${name}`;

/**
 * One zone per feature module: "files in <module> may not import from any other
 * feature module, nor from the integration layer".
 */
const zones = FEATURE_MODULES.map((name) => ({
  target: moduleDir(name),
  from: [
    ...FEATURE_MODULES.filter((other) => other !== name).map(moduleDir),
    moduleDir(INTEGRATION_MODULE),
  ],
  message:
    `Feature module "${name}" must work standalone, so it may not import from a ` +
    `sibling feature module or from ${moduleDir(INTEGRATION_MODULE)}. ` +
    `Put cross-module code in ${moduleDir(INTEGRATION_MODULE)}/ instead.`,
}));

export default [
  {
    ignores: ["build/", ".react-router/", "public/", "db/", "docs/"],
  },
  {
    // Scope: feature modules only. Nothing else in the repo is linted at all.
    files: ["app/features/**/*.{ts,tsx}"],
    languageOptions: {
      // Parser only — no type-aware linting, no @typescript-eslint rules.
      // This rule needs to parse import statements, nothing more.
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: { "import-x": importX },
    settings: {
      // Teaches the resolver the `~/* -> ./app/*` alias from tsconfig.json, so
      // aliased and relative imports both resolve to the same absolute path.
      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          project: path.join(ROOT, "tsconfig.json"),
        }),
      ],
    },
    rules: {
      // `basePath` is pinned to this file's directory so the zones do not
      // depend on the directory ESLint happens to be run from.
      "import-x/no-restricted-paths": ["error", { basePath: ROOT, zones }],
    },
  },
];
