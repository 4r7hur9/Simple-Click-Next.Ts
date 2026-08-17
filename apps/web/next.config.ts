import type { NextConfig } from "next";

const configuracao: NextConfig = {
  reactStrictMode: true,
  // Não anunciar a tecnologia do servidor: informação que só serve a quem
  // procura vulnerabilidade conhecida.
  poweredByHeader: false,
};

export default configuracao;
