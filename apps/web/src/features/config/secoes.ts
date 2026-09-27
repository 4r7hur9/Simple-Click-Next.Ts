/**
 * As seções que o dono configura, com o endereço de cada uma (AC-921).
 *
 * A LISTA VEM DO CONTRATO, e não é escrita de novo aqui: a API monta uma rota
 * por seção a partir da mesma lista, e a navegação do painel também. Uma seção
 * nova aparece nos dois lados ao mesmo tempo, e o que não está na lista —
 * tipo de negócio, apelido, documento, contrato, funcionalidades — não tem
 * como aparecer no painel do dono.
 */
import {
  ROTULOS_DAS_SECOES,
  SECOES_DO_DONO,
  type SecaoDoDono,
} from "@simpleclick/contracts";

/** O endereço de cada seção no painel. "horarios" no plural, como no mapa. */
export const CAMINHO_DA_SECAO: Readonly<Record<SecaoDoDono, string>> = {
  pagamento: "/painel/config/pagamento",
  entrega: "/painel/config/entrega",
  horario: "/painel/config/horarios",
  contato: "/painel/config/contato",
  aparencia: "/painel/config/aparencia",
  impressao: "/painel/config/impressao",
};

export interface ItemDaNavegacao {
  readonly secao: SecaoDoDono;
  readonly rotulo: string;
  readonly href: string;
}

/** A navegação das configurações, na ordem do contrato. */
export const NAVEGACAO_DA_CONFIGURACAO: readonly ItemDaNavegacao[] =
  SECOES_DO_DONO.map((secao) => ({
    secao,
    rotulo: ROTULOS_DAS_SECOES[secao],
    href: CAMINHO_DA_SECAO[secao],
  }));
