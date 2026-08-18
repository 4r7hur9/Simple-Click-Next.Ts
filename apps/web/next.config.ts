import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

/** Raiz do monorepo, vista deste arquivo. */
const raizDoMonorepo = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const configuracao: NextConfig = {
  reactStrictMode: true,
  // Saída autônoma: o build escreve um servidor mínimo com APENAS os arquivos
  // que ele realmente carrega. É o que permite a imagem de produção não ter
  // gerenciador de pacotes, nem dependência de desenvolvimento, nem
  // `node_modules` inteiro dentro dela (T-018).
  output: "standalone",
  // Sem esta raiz, o rastreamento de arquivos para na pasta do site e deixa
  // para trás os pacotes do monorepo, que no pnpm são ligações simbólicas para
  // fora dela — o servidor autônomo subiria sem o design system.
  outputFileTracingRoot: raizDoMonorepo,
  // O rastreamento acompanha o que o código IMPORTA, e o Next carrega os
  // ajudantes do compilador por um desvio em tempo de execução que nenhum
  // `import` declara. Resultado: a saída autônoma levava metade do pacote (só a
  // forma antiga de módulo) e o servidor morria na primeira linha, procurando a
  // outra metade. Pedir o pacote inteiro aqui é o conserto — e ele mora neste
  // arquivo, e não no Dockerfile, porque quem sabe o que falta na saída é quem
  // a produz.
  outputFileTracingIncludes: {
    "/**": [
      "../../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/**",
    ],
  },
  // O design system é distribuído como código-fonte TypeScript dentro do
  // monorepo: sem passo de build próprio, sem artefato para sincronizar, e a
  // alteração de um componente aparece na tela na hora.
  transpilePackages: ["@simpleclick/ui", "@simpleclick/contracts"],
  // Não anunciar a tecnologia do servidor: informação que só serve a quem
  // procura vulnerabilidade conhecida.
  poweredByHeader: false,
};

export default configuracao;
