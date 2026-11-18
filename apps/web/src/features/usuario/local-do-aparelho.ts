/**
 * A localização aproximada neste aparelho (card #105, LGPD).
 *
 * A coordenada é dado pessoal: só é gravada no armazenamento do navegador
 * com o consentimento de cookies FUNCIONAIS dado a partir da data em que os
 * textos passaram a falar de localização (`INICIO_DA_LOCALIZACAO`; quem
 * aceitou antes não autorizou isto). Sem isso ela vive só na memória da
 * página e some ao fechá-la.
 *
 * - é sempre arredondada (cerca de 100 m), ao gravar e ao ler;
 * - o navegador só a pede quando a pessoa aciona o botão (nunca ao abrir);
 * - recusar o consentimento ou sair da conta a apaga, junto com os stories
 *   vistos (`limparDadosLocaisDoCliente`);
 * - outras saídas (excluir a conta, sessão vencida, Sair do painel) não
 *   dependem de botão: o topo grava `sc:aparelho:teve-conta` quando há
 *   alguém logado e, ao abrir como visitante com a marca, limpa tudo.
 *
 * A chave `sc:feed:local` é a mesma que o feed sempre usou.
 */
import {
  consentimentoAtual,
  EVENTO_CONSENTIMENTO_MUDOU,
} from "../legal/consentimento.ts";
import { arredondarLocal } from "../feed/consulta.ts";
import { CHAVE_DOS_STORIES_VISTOS } from "../feed/social.ts";

/** Onde a localização fica guardada neste navegador. */
export const CHAVE_DO_LOCAL = "sc:feed:local";
/** Marca (sem dado pessoal) de que este aparelho já teve alguém logado. */
export const CHAVE_DA_MARCA_DE_CONTA = "sc:aparelho:teve-conta";

/** O dia em que os textos legais passaram a citar a localização aproximada. */
export const INICIO_DA_LOCALIZACAO = Date.parse("2026-11-12T00:00:00-03:00");

export interface LocalDoAparelho {
  readonly lat: number;
  readonly lng: number;
}

/** Sem consentimento a coordenada vive só aqui, até fechar a página. */
let emMemoria: LocalDoAparelho | null = null;

function arredondado(local: LocalDoAparelho): LocalDoAparelho {
  return { lat: arredondarLocal(local.lat), lng: arredondarLocal(local.lng) };
}

function valido(valor: unknown): valor is LocalDoAparelho {
  if (typeof valor !== "object" || valor === null) return false;
  const { lat, lng } = valor as Partial<LocalDoAparelho>;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

function armazenamento(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Pode gravar a coordenada no aparelho? (consentimento funcional recente) */
export function podeGuardarLocal(): boolean {
  const consentimento = consentimentoAtual();
  return (
    consentimento !== null &&
    consentimento.funcionais &&
    consentimento.em >= INICIO_DA_LOCALIZACAO
  );
}

/** A localização deste aparelho, já arredondada, ou `null`. */
export function lerLocalDoAparelho(): LocalDoAparelho | null {
  const guardado = armazenamento();
  if (guardado === null) return emMemoria;
  try {
    const bruto = guardado.getItem(CHAVE_DO_LOCAL);
    if (bruto === null) return emMemoria;
    if (!podeGuardarLocal()) {
      // Sobrou de antes do consentimento (ou ele foi retirado): apaga.
      guardado.removeItem(CHAVE_DO_LOCAL);
      return emMemoria;
    }
    const lido: unknown = JSON.parse(bruto);
    if (!valido(lido)) {
      guardado.removeItem(CHAVE_DO_LOCAL);
      return emMemoria;
    }
    const certo = arredondado(lido);
    // Gravado com mais precisão (versão antiga): regrava arredondado.
    if (certo.lat !== lido.lat || certo.lng !== lido.lng) {
      guardado.setItem(CHAVE_DO_LOCAL, JSON.stringify(certo));
    }
    emMemoria = certo;
    return certo;
  } catch {
    return emMemoria;
  }
}

/** Guarda (arredondada) a localização; `null` apaga. */
export function guardarLocalDoAparelho(local: LocalDoAparelho | null): void {
  if (local === null) {
    apagarLocalDoAparelho();
    return;
  }
  const certo = arredondado(local);
  emMemoria = certo;
  const guardado = armazenamento();
  if (guardado === null) return;
  try {
    if (podeGuardarLocal()) {
      guardado.setItem(CHAVE_DO_LOCAL, JSON.stringify(certo));
    } else {
      // Sem consentimento: nada fica no aparelho.
      guardado.removeItem(CHAVE_DO_LOCAL);
    }
  } catch {
    // Navegador sem armazenamento: só não lembra na próxima visita.
  }
}

/** Apaga a localização (memória e aparelho). */
export function apagarLocalDoAparelho(): void {
  emMemoria = null;
  try {
    armazenamento()?.removeItem(CHAVE_DO_LOCAL);
  } catch {
    // Sem armazenamento, não há o que apagar.
  }
}

/**
 * Tudo que o feed guardou da pessoa neste aparelho: a localização e os stories
 * vistos. Roda nos botões Sair e ao abrir como visitante num aparelho que teve
 * conta.
 */
export function limparDadosLocaisDoCliente(): void {
  apagarLocalDoAparelho();
  try {
    const guardado = armazenamento();
    guardado?.removeItem(CHAVE_DOS_STORIES_VISTOS);
    guardado?.removeItem(CHAVE_DA_MARCA_DE_CONTA);
  } catch {
    // Sem armazenamento, não há o que apagar.
  }
}

/**
 * Chamado pelo topo a cada montagem: logado grava a marca; visitante que
 * encontra a marca (a conta saiu por fora de um botão) limpa o aparelho.
 */
export function conferirContaDoAparelho(logado: boolean): void {
  const guardado = armazenamento();
  if (guardado === null) return;
  try {
    if (logado) {
      guardado.setItem(CHAVE_DA_MARCA_DE_CONTA, "1");
    } else if (guardado.getItem(CHAVE_DA_MARCA_DE_CONTA) !== null) {
      limparDadosLocaisDoCliente();
    }
  } catch {
    // Sem armazenamento, não há marca.
  }
}

/**
 * Ouve a escolha de cookies: sem o consentimento funcional recente a
 * coordenada é apagada na hora. Devolve quem cancela a escuta.
 */
export function apagarAoRecusarOConsentimento(
  aoApagar?: () => void,
): () => void {
  function aoMudar() {
    if (podeGuardarLocal()) return;
    apagarLocalDoAparelho();
    aoApagar?.();
  }
  window.addEventListener(EVENTO_CONSENTIMENTO_MUDOU, aoMudar);
  return () => window.removeEventListener(EVENTO_CONSENTIMENTO_MUDOU, aoMudar);
}
