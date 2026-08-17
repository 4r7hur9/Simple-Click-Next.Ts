/**
 * Configuração de qualidade de código compartilhada pelo monorepo.
 *
 * Composição: `base` vale para todo TypeScript; `fronteiras` acrescenta as
 * regras de dependência entre camadas; `cores` proíbe cor escrita à mão fora
 * do tema (AC-014); `seguranca` traz as verificações que a constituição exige
 * (P-002, P-008, P-009).
 */

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import { configFronteiras } from "./fronteiras.js";
import { configCores } from "./cores.js";

/** Arquivos que nenhuma verificação precisa olhar. */
export const ignorados = {
  ignores: [
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "**/coverage/**",
    "**/.turbo/**",
    "**/playwright-report/**",
    "**/test-results/**",
    "**/*.gen.ts",
  ],
};

/** Regras base de TypeScript, sem exigir informação de tipo. */
export const base = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      // Função com uma responsabilidade e nome que diz qual (P-013).
      "max-depth": ["warn", 3],
      "max-params": ["warn", 4],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
];

/** Verificações que a constituição exige e que o audit também confere. */
export const seguranca = {
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        // P-008: token de sessão nunca fica acessível a script.
        selector:
          "CallExpression[callee.object.name=/^(local|session)Storage$/][arguments.0.value=/token|jwt|auth|refresh/i]",
        message:
          "P-008: token de sessão não pode ir para o armazenamento do navegador. Use cookie inacessível a script.",
      },
      {
        // P-005: dinheiro é inteiro em centavos.
        selector: "CallExpression[callee.name='parseFloat']",
        message:
          "P-005: valor monetário é inteiro em centavos. parseFloat abre porta para erro de arredondamento — foi assim que o preço vazava do DOM no primeiro SimpleClick.",
      },
    ],
  },
};

/** Configuração completa, na ordem de composição esperada. */
export function configBase() {
  const fronteiras = configFronteiras();

  return [
    ignorados,
    ...base,
    {
      files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
      plugins: { boundaries },
      settings: fronteiras.settings,
      rules: {
        ...fronteiras.rules,
        ...seguranca.rules,
      },
    },
    ...configCores(),
    {
      // Teste monta cenário e às vezes precisa alcançar o que a camada de
      // produção não alcança. A fronteira vale para o código que vai ao ar —
      // e provar que a regra de cor acusa exige escrever a cor proibida.
      files: [
        "**/*.test.{ts,tsx,js}",
        "**/tests/**",
        "**/*.config.{ts,js,mjs}",
      ],
      rules: {
        "boundaries/dependencies": "off",
        "no-console": "off",
        "cores/sem-cor-literal": "off",
      },
    },
  ];
}

export default configBase;
