/**
 * A rota da vitrine pública (AC-400, AC-401, AC-402).
 *
 * ESTA ROTA É A COSTURA. Três peças já existiam e não se falavam, porque a
 * tabela de fronteiras não deixa um módulo importar outro: identificar a loja
 * pelo endereço mora em `storefront`, ler o horário mora em `stores`, e decidir
 * se está aberta mora em `packages/core`. Quem junta é a borda — a única camada
 * que enxerga os dois lados.
 *
 * DUAS TRANSAÇÕES, e não uma. Identificar a loja acontece SEM contexto de loja,
 * porque nesse momento ainda não se sabe qual é; ler a vitrine acontece com a
 * loja declarada, numa transação nova. O contexto é definido uma vez, no início
 * da transação, e não muda mais — é essa regra que impede uma requisição de
 * escorregar de uma loja para outra no meio do caminho.
 */

import { Router } from "express";
import type { HorarioDaLoja } from "@simpleclick/core";
import { esquemaDoApelido } from "@simpleclick/contracts";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import { erroDeDominio } from "../../core/erros.ts";
import { validar } from "../../core/validar.ts";
import { identificarLoja, lojaDaVitrine } from "./resolver-loja.usecase.ts";

/**
 * O que a rota precisa de fora.
 *
 * `lerHorario` chega por parâmetro, e não é importado: quem sabe ler o horário é
 * o módulo da loja, e a tabela de fronteiras não autoriza um módulo a importar
 * outro. Quem junta os dois é `app.ts`, que não pertence a camada nenhuma
 * justamente por ser a borda. Sem essa regra, os módulos viram uma teia em que
 * tudo importa tudo.
 */
export interface OpcoesDaVitrine {
  readonly acesso?: AcessoAoBanco;
  /** O instante, para a prova poder fixar o relógio. */
  readonly agora?: () => Date;
  /** Como obter o horário da loja que já está no contexto. */
  readonly lerHorario: (agora: Date) => Promise<HorarioDaLoja>;
}

export function criarRotasDaVitrine(opcoes: OpcoesDaVitrine): Router {
  const rotas = Router();
  // O esquema vem do CONTRATO, e não é reescrito aqui: o documento publicado e
  // a validação de borda precisam dizer a mesma coisa, senão o aplicativo
  // nativo gera cliente com uma regra e a API cobra outra.
  const borda = validar({ params: esquemaDoApelido });

  rotas.get("/:apelido", borda, async (req, res, proximo) => {
    try {
      const { params } = borda.dados(req);
      const acesso = opcoes.acesso ?? banco();
      const agora = opcoes.agora?.() ?? new Date();

      // PASSO 1 — sem loja no contexto, porque ainda não se sabe qual é.
      const identificacao = await executarComoRequisicao(
        { papel: "PUBLIC" },
        () => acesso.emTransacao(() => identificarLoja(params)),
      );

      if (!identificacao.encontrada) {
        // Inexistente e suspensa saem pela MESMA porta, com a mesma resposta
        // (AC-402). Distinguir contaria a quem perguntasse que aquele
        // endereço já existiu e foi suspenso.
        throw erroDeDominio("nao_encontrado", { recurso: "loja" });
      }

      // PASSO 2 — transação nova, com a loja declarada desde o início.
      const vitrine = await executarComoRequisicao(
        { papel: "PUBLIC", lojaId: identificacao.id },
        () =>
          acesso.emTransacao(async () =>
            lojaDaVitrine(agora, await opcoes.lerHorario(agora)),
          ),
      );

      if (vitrine === null) {
        // A política pública é a segunda trava: ela recusa a loja que não
        // estiver ativa mesmo que a resolução tenha deixado passar.
        throw erroDeDominio("nao_encontrado", { recurso: "loja" });
      }

      res.json({
        loja: vitrine.publica,
        abertura: vitrine.abertura,
        redirecionarPara: identificacao.redirecionarPara,
      });
    } catch (erro) {
      proximo(erro);
    }
  });

  return rotas;
}

/** Onde as rotas da vitrine ficam montadas. */
export const PREFIXO_DA_VITRINE = "/v1/vitrine";
