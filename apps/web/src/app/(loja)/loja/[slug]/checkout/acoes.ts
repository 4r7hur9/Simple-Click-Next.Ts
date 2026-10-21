"use server";
/**
 * A ação que a janela do fechamento chama ao abrir.
 *
 * MORA NA ROTA, e não em `features/`: a tabela de fronteiras não deixa a camada
 * de componentes alcançar `src/server/`. O cardápio passa esta função à sacola
 * já presa ao apelido da loja (`.bind`), e a janela só sabe pedir "prepare o
 * fechamento".
 *
 * É AQUI, E SÓ AQUI, QUE A CHAVE PIX SAI DO SERVIDOR: quando a pessoa tocou em
 * "Fechar pedido". A página do cardápio não a carrega (AC-904).
 */
import { cookies } from "next/headers";

import type { PreparoDoFechamento } from "../../../../../features/checkout/preparo-do-fechamento.ts";
import { lerContaQueFecha } from "../../../../../server/conta-do-fechamento.ts";
import { buscarFechamento } from "../../../../../server/fechamento.ts";
import { NOME_DO_COOKIE_DE_ACESSO } from "../../../../../server/session-cookie.ts";
import { buscarVitrine } from "../../../../../server/vitrine.ts";

export async function prepararFechamentoDaJanela(
  apelidoDaLoja: string,
): Promise<PreparoDoFechamento> {
  const token = (await cookies()).get(NOME_DO_COOKIE_DE_ACESSO)?.value;
  const [vitrine, fechamento, quem] = await Promise.all([
    buscarVitrine(apelidoDaLoja),
    buscarFechamento(apelidoDaLoja),
    lerContaQueFecha(token),
  ]);

  if (vitrine.estado !== "encontrada" || fechamento.estado !== "encontrado") {
    return { estado: "indisponivel" };
  }

  const config = fechamento.fechamento;
  return {
    estado: "pronto",
    config: {
      formas: {
        aceitaEntrega: config.entrega.aceitaEntrega,
        aceitaRetirada: config.entrega.aceitaRetirada,
        // O endereço da loja aparece na RETIRADA, para a pessoa saber onde
        // buscar — e não aparece na entrega, onde seria ruído.
        enderecoDaLoja: enderecoEmUmaLinha(
          vitrine.vitrine.loja.enderecoParaRetirada,
        ),
      },
      formasDePagamento: config.formasDePagamento,
      pix: config.pix,
      entrega: {
        taxaCentavos: config.entrega.taxaCentavos,
        nomeDaTaxa: config.entrega.nomeDaTaxa,
        gratisAcimaDeCentavos: config.entrega.gratisAcimaDeCentavos,
        minimoParaEntregaCentavos: config.entrega.minimoParaEntregaCentavos,
      },
    },
    conta: quem.conta,
    enderecos: quem.enderecos,
  };
}

/** Junta as partes do endereço numa linha, sem vírgula sobrando. */
function enderecoEmUmaLinha(
  endereco: {
    readonly logradouro: string | null;
    readonly numero: string | null;
    readonly bairro: string | null;
    readonly cidade: string | null;
    readonly uf: string | null;
  } | null,
): string | null {
  if (endereco === null) return null;
  const rua = [endereco.logradouro, endereco.numero].filter(Boolean).join(", ");
  const cidade = [endereco.cidade, endereco.uf].filter(Boolean).join("/");
  const linha = [rua, endereco.bairro, cidade].filter(Boolean).join(" · ");
  return linha === "" ? null : linha;
}
