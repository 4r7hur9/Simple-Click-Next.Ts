import type { NextConfig } from "next";

const configuracao: NextConfig = {
  reactStrictMode: true,
  // O design system é distribuído como código-fonte TypeScript dentro do
  // monorepo: sem passo de build próprio, sem artefato para sincronizar, e a
  // alteração de um componente aparece na tela na hora.
  transpilePackages: ["@simpleclick/ui"],
  // Não anunciar a tecnologia do servidor: informação que só serve a quem
  // procura vulnerabilidade conhecida.
  poweredByHeader: false,
};

export default configuracao;
