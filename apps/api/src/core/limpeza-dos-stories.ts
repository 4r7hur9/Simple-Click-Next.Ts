/**
 * A limpeza dos stories vencidos (card #46).
 *
 * O story some das listagens NA HORA em que vence (toda leitura filtra
 * `expires_at > now()`). Esta limpeza é a segunda metade: APAGA o arquivo do
 * armazenamento e a linha do banco, para nada ficar guardado depois das 24
 * horas.
 *
 * Roda no próprio processo da API, de `STORIES_LIMPEZA_MINUTOS` em
 * `STORIES_LIMPEZA_MINUTOS` (padrão 10; 0 desliga), e uma vez logo depois da
 * partida. Não depende do segundo plano (Redis): ambiente local também limpa.
 *
 * ORDEM: primeiro o arquivo, depois a linha. Arquivo que não sai (serviço
 * fora do ar) mantém a linha — invisível, porque já venceu — e a próxima
 * rodada tenta de novo. Apagar a linha antes perderia a chave do arquivo, e o
 * arquivo ficaria guardado para sempre.
 *
 * Pela credencial da administração: a limpeza atravessa todas as lojas.
 */

import { executarComoRequisicao } from "./contexto.ts";
import { bancoDaAdministracao, type AcessoAoBanco } from "./db.ts";
import type { ArmazenamentoDeMidia } from "./armazenamento-de-midia.ts";
import { registrar } from "./log.ts";

/** Quantos stories uma rodada apaga, no máximo (o resto fica para a próxima). */
export const LOTE_DA_LIMPEZA = 500;

export interface ResultadoDaLimpeza {
  readonly apagados: number;
  readonly arquivosQueFicaram: number;
}

export interface OpcoesDaLimpeza {
  readonly armazenamento: ArmazenamentoDeMidia;
  /** Credencial `sc_admin`. Padrão: a do ambiente. */
  readonly acesso?: () => AcessoAoBanco;
}

/** A limpeza como função do relógio: apaga o que venceu até `agora`. */
export function criarLimpezaDosStories(
  opcoes: OpcoesDaLimpeza,
): (agora: Date) => Promise<ResultadoDaLimpeza> {
  const acesso = opcoes.acesso ?? (() => bancoDaAdministracao());
  return async (agora) => {
    const vencidos = await executarComoRequisicao({}, () =>
      acesso().emTransacao(
        (tx) => tx.$queryRaw<
          { id: string; store_id: string; storage_key: string }[]
        >`
          SELECT id, store_id, storage_key FROM app.stories
           WHERE expires_at <= ${agora}
           ORDER BY expires_at
           LIMIT ${LOTE_DA_LIMPEZA}`,
      ),
    );
    if (vencidos.length === 0) return { apagados: 0, arquivosQueFicaram: 0 };

    const podemSair: string[] = [];
    let ficaram = 0;
    for (const story of vencidos) {
      try {
        await opcoes.armazenamento.apagar(story.storage_key);
        podemSair.push(story.id);
      } catch {
        ficaram += 1;
        registrar.aviso("stories.arquivo_nao_apagado", {
          lojaId: story.store_id,
          recurso: "story",
        });
      }
    }

    const apagados =
      podemSair.length === 0
        ? 0
        : await executarComoRequisicao({}, () =>
            acesso().emTransacao(
              (tx) => tx.$executeRaw`
                DELETE FROM app.stories
                 WHERE id = ANY (${podemSair}::uuid[])
                   AND expires_at <= ${agora}`,
            ),
          );
    registrar.info("stories.limpeza", {
      quantidade: apagados,
      detalhe: `${ficaram} arquivo(s) para a próxima rodada`,
    });
    return { apagados, arquivosQueFicaram: ficaram };
  };
}

export interface LimpezaAgendada {
  parar(): void;
}

/**
 * Agenda a limpeza a cada `intervaloMs`, e uma vez logo depois de ligar. O
 * relógio não segura o processo de pé (`unref`). Rodada que falha só avisa:
 * a próxima tenta de novo.
 */
export function agendarLimpezaDosStories(
  limpar: (agora: Date) => Promise<unknown>,
  intervaloMs: number,
  aoFalhar: (motivo: string) => void = (motivo) =>
    registrar.aviso("stories.limpeza_falhou", { causa: motivo }),
): LimpezaAgendada {
  let rodando = false;
  const rodar = () => {
    if (rodando) return;
    rodando = true;
    limpar(new Date())
      .catch((causa: unknown) =>
        aoFalhar(causa instanceof Error ? causa.message : String(causa)),
      )
      .finally(() => {
        rodando = false;
      });
  };
  const primeira = setTimeout(rodar, 5_000);
  const relogio = setInterval(rodar, intervaloMs);
  primeira.unref();
  relogio.unref();
  return {
    parar() {
      clearTimeout(primeira);
      clearInterval(relogio);
    },
  };
}
