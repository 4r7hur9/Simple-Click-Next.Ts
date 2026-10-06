/**
 * O agente de impressão: pede trabalho à API e escreve na impressora (T-609 —
 * US-605, AC-623, AC-624, AC-625).
 *
 * Não abre porta nenhuma: é ele quem pergunta, a cada poucos segundos, e cada
 * pergunta conta como batimento — é assim que o painel sabe se ele está de pé
 * (AC-624). O cupom chega SEMÂNTICO (contrato versão 1) e é compilado aqui,
 * com o perfil da impressora desta loja, pelas MESMAS funções da impressão
 * pelo navegador: `lerCupomImpresso`, `diagramarCupom` e `compilarEscPos`, de
 * `packages/core`. Não existe uma segunda implementação do cupom.
 *
 * A ordem de cada trabalho é a garantia do AC-625: imprimir, gravar no diário
 * e só então confirmar. Confirmação perdida volta como o MESMO trabalho, e o
 * diário faz o agente só confirmar de novo.
 */
import {
  compilarEscPos,
  diagramarCupom,
  lerCupomImpresso,
  type PerfilDaImpressora,
} from "@simpleclick/core";
import type { TrabalhoDeImpressaoNoContrato } from "@simpleclick/contracts";

import type { ClienteDaApi } from "./cliente.ts";
import type { Diario } from "./diario.ts";

/** Intervalo entre consultas: 2,5 s, dentro dos "poucos segundos" do AC-623. */
export const INTERVALO_PADRAO_MS = 2_500;

/** Um evento do agente, para o registro local (nunca dado do cliente). */
export type RegistroDoAgente = (
  evento: string,
  dados?: Record<string, string | number>,
) => void;

export interface DependenciasDoAgente {
  readonly cliente: ClienteDaApi;
  readonly diario: Diario;
  /** Escreve os bytes na impressora; rejeita se ela não aceitar. */
  readonly imprimir: (bytes: Uint8Array) => Promise<void>;
  /** Tabela de caracteres e corte da impressora desta loja. */
  readonly perfil: PerfilDaImpressora;
  readonly registrar?: RegistroDoAgente;
}

/** O que aconteceu com um trabalho nesta rodada. */
export type DesfechoDoTrabalho =
  | "impresso"
  /** Saiu no papel, mas a confirmação não chegou: o reenvio só confirma. */
  | "impresso_sem_confirmar"
  /** Já estava no diário: confirmado de novo, sem imprimir (AC-625). */
  | "reconfirmado"
  /** Não saiu: a falha foi contada à API, que reenvia com espera. */
  | "falhou";

function mensagemDe(causa: unknown): string {
  return causa instanceof Error ? causa.message : String(causa);
}

/** Conta a falha à API; se nem isso der, o prazo de posse devolve o trabalho. */
async function contarFalha(
  dep: DependenciasDoAgente,
  id: string,
  motivo: string,
): Promise<DesfechoDoTrabalho> {
  dep.registrar?.("impressao.falhou", { trabalho: id, motivo });
  try {
    await dep.cliente.registrarFalha(id, motivo);
  } catch (causa) {
    dep.registrar?.("impressao.falha_nao_registrada", {
      trabalho: id,
      motivo: mensagemDe(causa),
    });
  }
  return "falhou";
}

/** Um trabalho, do cupom ao papel, na ordem que impede a impressão dupla. */
export async function processarTrabalho(
  trabalho: TrabalhoDeImpressaoNoContrato,
  dep: DependenciasDoAgente,
): Promise<DesfechoDoTrabalho> {
  const { id } = trabalho;

  if (dep.diario.jaImpresso(id)) {
    try {
      await dep.cliente.confirmar(id);
      dep.registrar?.("impressao.reconfirmada", { trabalho: id });
      return "reconfirmado";
    } catch (causa) {
      dep.registrar?.("impressao.confirmacao_perdida", {
        trabalho: id,
        motivo: mensagemDe(causa),
      });
      return "impresso_sem_confirmar";
    }
  }

  // Versão desconhecida do cupom é recusada: imprimir errado é pior que não
  // imprimir, e o dono ainda tem o clique (AC-626).
  const cupom = lerCupomImpresso(trabalho.cupom);
  if (cupom === null) {
    return contarFalha(
      dep,
      id,
      `cupom na versão ${String(trabalho.cupom.versao)}, que este agente não conhece; atualize o agente`,
    );
  }

  let bytes: Uint8Array;
  try {
    const linhas = diagramarCupom(cupom, { tabela: dep.perfil.tabela });
    bytes = compilarEscPos(linhas, dep.perfil);
  } catch (causa) {
    return contarFalha(dep, id, `cupom não compilou: ${mensagemDe(causa)}`);
  }

  try {
    await dep.imprimir(bytes);
  } catch (causa) {
    return contarFalha(dep, id, mensagemDe(causa));
  }

  // ANTES de confirmar: se o processo cair aqui ou a confirmação se perder,
  // o reenvio encontra o trabalho no diário e não imprime de novo.
  await dep.diario.registrar(id);
  dep.registrar?.("impressao.impresso", {
    trabalho: id,
    pedido: trabalho.pedido.codigo,
    via: cupom.via,
  });

  try {
    await dep.cliente.confirmar(id);
    return "impresso";
  } catch (causa) {
    dep.registrar?.("impressao.confirmacao_perdida", {
      trabalho: id,
      motivo: mensagemDe(causa),
    });
    return "impresso_sem_confirmar";
  }
}

/** Uma consulta à API e os trabalhos que ela entregou, um de cada vez. */
export async function rodarUmaVez(
  dep: DependenciasDoAgente,
): Promise<DesfechoDoTrabalho[]> {
  const trabalhos = await dep.cliente.buscarTrabalhos();
  const desfechos: DesfechoDoTrabalho[] = [];
  // Em ordem e um por vez: a impressora é uma só, e a cozinha lê na ordem
  // em que os pedidos entraram.
  for (const trabalho of trabalhos) {
    desfechos.push(await processarTrabalho(trabalho, dep));
  }
  return desfechos;
}

/**
 * O laço do agente: consulta, imprime, espera, até o sinal parar. Erro de
 * rede ou da API não derruba o agente — ele registra e tenta de novo na
 * volta seguinte, que é o que mantém o cupom saindo quando a internet da loja
 * oscila.
 */
export async function executarAgente(
  dep: DependenciasDoAgente,
  opcoes: { readonly intervaloMs?: number; readonly sinal?: AbortSignal } = {},
): Promise<void> {
  const intervaloMs = opcoes.intervaloMs ?? INTERVALO_PADRAO_MS;
  // Função, e não a propriedade lida uma vez: o sinal muda durante a espera.
  const parado = () => opcoes.sinal?.aborted === true;
  while (!parado()) {
    try {
      await rodarUmaVez(dep);
    } catch (causa) {
      dep.registrar?.("agente.consulta_falhou", { motivo: mensagemDe(causa) });
    }
    if (parado()) break;
    await new Promise<void>((acordar) => {
      const relogio = setTimeout(acordar, intervaloMs);
      opcoes.sinal?.addEventListener(
        "abort",
        () => {
          clearTimeout(relogio);
          acordar();
        },
        { once: true },
      );
    });
  }
}
