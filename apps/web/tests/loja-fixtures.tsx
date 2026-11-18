/**
 * Dados e montagem comuns dos testes do perfil da loja (card #107).
 * Não é um teste: não termina em `.test`.
 */
import type { ProdutoDoFeed, Vitrine } from "@simpleclick/contracts";
import { renderToStaticMarkup } from "react-dom/server";

import { PerfilDaLoja } from "../src/features/loja/PerfilDaLoja.tsx";
import type { ProdutoNaTela } from "../src/lib/catalogo.ts";

export const LOJA_DO_PERFIL = {
  apelido: "casa-do-ze",
  nome: "Casa do Zé",
  ramo: "FOOD_SNACK",
  boasVindas: "Tudo fresquinho.",
  sobre: "Desde 2009 no bairro.",
  logo: null,
  capa: null,
  formasDeEntrega: ["DELIVERY"],
  enderecoParaRetirada: null,
  whatsappPublico: null,
  rotulos: { catalogo: "Cardápio" },
  tema: { corDestaque: "#0f6e5c", fundoVitrine: null, topoCardapio: null },
} as unknown as Vitrine["loja"];

export const ABERTURA_DO_PERFIL = {
  aberta: true,
  proximaAbertura: null,
  motivo: "ABERTA",
} as unknown as Vitrine["abertura"];

export function destaque(id: string, nome: string): ProdutoNaTela {
  return {
    id,
    apelido: id,
    nome,
    chamada: null,
    preco: "R$ 12,00",
    precoCentavos: 1200,
    precoAnterior: null,
    imagem: null,
    disponivel: true,
    link: `/loja/casa-do-ze/produto/${id}`,
  };
}

export function post(id: string, nome: string): ProdutoDoFeed {
  return {
    id,
    nome,
    descricao: null,
    precoCentavos: 1200,
    precoOriginalCentavos: null,
    imagem: null,
    categoria: "Salgados",
    loja: {
      apelido: "casa-do-ze",
      nome: "Casa do Zé",
      tipoDeNegocio: "FOOD_SNACK",
      logo: null,
      cidade: "São Paulo",
      bairro: "Centro",
      formasDeEntrega: ["DELIVERY"],
    },
    distanciaKm: null,
    publicadoEm: "",
  } as unknown as ProdutoDoFeed;
}

export function desenharPerfil(
  extra: Partial<Parameters<typeof PerfilDaLoja>[0]> = {},
): HTMLElement {
  const caixa = document.createElement("div");
  caixa.innerHTML = renderToStaticMarkup(
    <PerfilDaLoja
      loja={LOJA_DO_PERFIL}
      abertura={ABERTURA_DO_PERFIL}
      horario={null}
      recebimento={null}
      destaques={[]}
      posts={[]}
      logado={false}
      favorita={false}
      sobreAberto={false}
      {...extra}
    />,
  );
  return caixa;
}
