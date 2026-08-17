import { configBase } from "@simpleclick/config-eslint";

export default [
  ...configBase(),
  {
    // Scripts de linha de comando e configuração rodam fora das camadas, e
    // imprimir na tela é a função deles — não um descuido de depuração.
    files: [
      "*.config.{js,ts,mjs}",
      "infra/**/*.{js,mjs,ts}",
      "e2e/**/*.ts",
      "packages/*/*.js",
    ],
    rules: {
      "boundaries/dependencies": "off",
      "no-console": "off",
    },
  },
];
