/**
 * O dono alterou a loja: o site esquece a vitrine dela ANTES de o dono receber
 * a resposta (dívida 93, a metade de AC-028 que faltava ligar — dívida 43).
 *
 * ## Por que um ponto só, e não uma chamada em cada caso de uso
 *
 * O site guarda a vitrine, o catálogo, a página do produto e o fechamento por
 * um minuto. Quem os invalida é a API, avisando a rota autenticada do site
 * (`criarAvisoDoSite`, T-015). O que faltava era QUEM avisa. Pôr o aviso em
 * cada caso de uso do painel daria trinta pontos de chamada — e o trigésimo
 * primeiro, a rota que alguém criar no mês que vem, esqueceria. É o mesmo
 * raciocínio da regra 7 de `core/db.ts` para a autorização do dono: toda
 * alteração do dono passa por `/v1/lojas/:apelido/catalogo/...` ou
 * `/v1/lojas/:apelido/configuracao/...`, e é ali, na entrada, que o aviso
 * fica. Rota nova nesses trechos já nasce avisando.
 *
 * ## Por que a resposta espera o aviso
 *
 * O dono salva e, no segundo seguinte, abre a própria loja. Se o aviso saísse
 * depois da resposta, essa visita poderia chegar ao site antes dele — e
 * mostrar a versão velha, que é justamente o defeito. Por isso o fim da
 * resposta é segurado até o aviso terminar. O custo é limitado pelo prazo do
 * aviso (`TEMPO_LIMITE_DO_AVISO_MS`), e só existe em alteração do dono, que é
 * rara perto das visitas.
 *
 * ## Por que o aviso nunca derruba a alteração
 *
 * A alteração já foi gravada quando a resposta de sucesso começa a sair. Site
 * fora do ar, segredo trocado ou rede lenta viram `"indisponivel"` ou
 * `"recusado"`, a resposta segue igual, e o prazo de validade do site assume:
 * o dado velho morre sozinho em um minuto.
 *
 * ## Por que o apelido, e não o identificador da loja
 *
 * O site lê a vitrine pelo endereço que o cliente abriu, e a etiqueta precisa
 * existir antes de se saber qual loja responde — então ela é montada pelo
 * apelido. A rota do dono traz o mesmo apelido no caminho: avisar por ele não
 * custa consulta nenhuma ao banco.
 */

import type { RequestHandler, Response } from "express";

import {
  criarAvisoDoSite,
  lerConfiguracaoDoAviso,
  type AvisoDeMudanca,
  type FonteDeAmbiente,
  type ResultadoDoAviso,
} from "./cache.ts";

/** Quem avisa o site. Em execução é `criarAvisoDoSite`; no teste, um espião. */
export type AvisarOSite = (aviso: AvisoDeMudanca) => Promise<ResultadoDoAviso>;

/**
 * Os trechos das rotas do dono cujo efeito aparece na vitrine.
 *
 * A fila de pedidos e o cupom ficam de fora de propósito: a vitrine não mostra
 * pedido, e avisar a cada mudança de status esvaziaria o cache da loja
 * justamente no horário de pico, quando ele mais ajuda.
 */
export const TRECHOS_QUE_A_VITRINE_MOSTRA: ReadonlySet<string> = new Set([
  "catalogo",
  "configuracao",
  // O tema da loja (card #25): cor de destaque, fundo e topo do cardápio.
  "tema",
]);

/** Verbos que alteram. Leitura não muda a loja, e não avisa. */
const VERBOS_QUE_ALTERAM: ReadonlySet<string> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

/** A forma do apelido no endereço — a mesma do contrato (`esquemaDoApelido`). */
const FORMA_DO_APELIDO = /^[a-z0-9-]{2,80}$/;

/**
 * O apelido da loja que esta requisição altera, ou `null` quando ela não
 * altera nada que a vitrine mostre.
 *
 * `caminho` é o caminho já sem o prefixo de montagem (`/v1/lojas`), como o
 * Express o entrega a um middleware montado ali: `/<apelido>/<trecho>/...`.
 * Apelido fora da forma não avisa — a própria rota vai recusá-lo.
 */
export function apelidoDaAlteracao(
  metodo: string,
  caminho: string,
): string | null {
  if (!VERBOS_QUE_ALTERAM.has(metodo.toUpperCase())) return null;
  const [vazio, apelido, trecho] = caminho.split("/");
  if (vazio !== "" || apelido === undefined || trecho === undefined) {
    return null;
  }
  if (!TRECHOS_QUE_A_VITRINE_MOSTRA.has(trecho)) return null;
  return FORMA_DO_APELIDO.test(apelido) ? apelido : null;
}

/** Sucesso é 2xx: só então a alteração foi gravada. */
function deuCerto(resposta: Response): boolean {
  return resposta.statusCode >= 200 && resposta.statusCode < 300;
}

/**
 * O ponto único de aviso, montado em `/v1/lojas` antes das rotas do dono.
 *
 * Segura o FIM da resposta de sucesso até o aviso terminar. Cabeçalho e corpo
 * já estão prontos nesse momento; o que espera é só a entrega. Resposta de
 * recusa ou de erro sai na hora e não avisa — nada mudou na loja.
 */
export function avisarOSiteQuandoODonoAltera(
  avisar: AvisarOSite,
): RequestHandler {
  return (requisicao, resposta, proximo) => {
    const apelido = apelidoDaAlteracao(requisicao.method, requisicao.path);
    if (apelido === null) {
      proximo();
      return;
    }

    const terminar = resposta.end.bind(resposta) as (
      ...argumentos: unknown[]
    ) => Response;
    let avisado = false;

    resposta.end = ((...argumentos: unknown[]) => {
      if (avisado || !deuCerto(resposta)) return terminar(...argumentos);
      avisado = true;
      void avisar({ apelido })
        .catch((): ResultadoDoAviso => "indisponivel")
        .finally(() => {
          terminar(...argumentos);
        });
      return resposta;
    }) as Response["end"];

    proximo();
  };
}

/** O aviso desligado: o prazo de validade do site é o que resta. */
const avisoDesligado: AvisarOSite = criarAvisoDoSite({
  configuracao: undefined,
});

/**
 * O avisador da API em execução, lido do ambiente na partida.
 *
 * Sem `SEGREDO_DE_REVALIDACAO`, o aviso fica desligado mesmo que
 * `URL_DO_SITE` exista — o endereço sozinho é configuração legítima, porque o
 * convite e o canônico também o usam. Com o segredo, a configuração precisa
 * estar inteira e forte: segredo curto ou sem endereço recusa a partida, em
 * vez de parecer ligado e nunca funcionar.
 *
 * Quem chama é `main.ts`. `criarApp` sozinho não avisa ninguém, para que os
 * testes da API nunca saiam pela rede atrás de um site que não está de pé.
 */
export function avisoDoSiteDoAmbiente(
  fonte: FonteDeAmbiente = process.env,
  enviar?: typeof fetch,
): AvisarOSite {
  if ((fonte.SEGREDO_DE_REVALIDACAO?.trim() ?? "") === "") {
    return avisoDesligado;
  }
  return criarAvisoDoSite({
    configuracao: lerConfiguracaoDoAviso(fonte),
    ...(enviar === undefined ? {} : { enviar }),
  });
}

/** Para quem monta a aplicação sem aviso: o prazo de validade assume. */
export const naoAvisarOSite: AvisarOSite = avisoDesligado;
