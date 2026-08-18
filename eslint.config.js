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
      // O typescript-eslint desliga esta regra por padrão, partindo do princípio
      // de que o compilador acusa chave repetida (TS1117). Só que estes arquivos
      // não pertencem a tsconfig nenhum — não existe `tsconfig.json` na raiz, e
      // `turbo run typecheck` roda por pacote. O resultado é um ponto cego real:
      // uma chave `exclude` repetida no vitest.config.ts fez cinco testes de
      // fila rodarem também no projeto de banco, cada um pagando um banco
      // descartável que nunca abriam, sem nenhuma ferramenta reclamar. Ligada
      // aqui, e só aqui, a regra cobre exatamente o que o compilador não vê.
      "no-dupe-keys": "error",
    },
  },
];
