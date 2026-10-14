"use client";

// A tabela recebe funções em cada coluna, e função não atravessa do servidor
// para o navegador: por isso a vitrine monta as colunas aqui, já no navegador.
import { Selo, Tabela, type ColunaDaTabela } from "@simpleclick/ui";

import { PEDIDOS_DA_TABELA, type PedidoDaTabela } from "./dados-da-vitrine.ts";

const TOM_DO_STATUS = {
  Pago: "sucesso",
  "Em preparo": "atencao",
  Recusado: "erro",
  Novo: "info",
} as const;

const COLUNAS: readonly ColunaDaTabela<PedidoDaTabela>[] = [
  {
    chave: "numero",
    titulo: "Pedido",
    celula: (p) => `#${p.numero}`,
    valorParaOrdenar: (p) => p.numero,
  },
  {
    chave: "cliente",
    titulo: "Cliente",
    celula: (p) => p.cliente,
    valorParaOrdenar: (p) => p.cliente,
  },
  {
    chave: "status",
    titulo: "Status",
    celula: (p) => <Selo tom={TOM_DO_STATUS[p.status]}>{p.status}</Selo>,
  },
  {
    chave: "total",
    titulo: "Total",
    alinhamento: "fim",
    celula: (p) =>
      (p.centavos / 100).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      }),
    valorParaOrdenar: (p) => p.centavos,
  },
];

/** Tabela de pedidos de exemplo, no modo de celular pedido. */
export function TabelaDeExemplo({
  noCelular,
  legenda,
  alturaMaxima,
}: {
  noCelular: "rolar" | "cartoes";
  legenda: string;
  alturaMaxima?: string;
}) {
  return (
    <Tabela
      alturaMaxima={alturaMaxima}
      chaveDaLinha={(p) => p.numero.toString()}
      colunas={COLUNAS}
      legenda={legenda}
      linhas={PEDIDOS_DA_TABELA}
      noCelular={noCelular}
      ordemInicial={{ coluna: "numero", direcao: "decrescente" }}
    />
  );
}
