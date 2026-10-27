/** Decisão conservadora sobre efeitos opcionais da landing. */
export interface SinaisDeCapacidade {
  readonly ponteiroGrosso: boolean;
  readonly memoriaEmGiB: number;
  readonly nucleos: number;
  readonly economiaDeDados: boolean;
  readonly movimentoReduzido: boolean;
  readonly quadrosPorSegundo: number;
}

export type NivelDeEfeitos = "estatico" | "leve" | "completo";

/** Aparelhos sem telemetria suficiente ficam no modo estático. */
export function nivelDeEfeitos(sinais: SinaisDeCapacidade): NivelDeEfeitos {
  if (sinais.movimentoReduzido || sinais.economiaDeDados) return "estatico";
  if (sinais.memoriaEmGiB < 4 || sinais.nucleos < 4 || sinais.quadrosPorSegundo < 48) {
    return "estatico";
  }
  return sinais.ponteiroGrosso ? "leve" : "completo";
}

/** Mede o início por meio segundo, sem iniciar nenhuma animação pesada. */
export function medirQuadrosIniciais(duracaoMs = 500): Promise<number> {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    return Promise.resolve(0);
  }

  return new Promise((resolver) => {
    let inicio: number | undefined;
    let quadros = 0;
    const quadro = (agora: number) => {
      inicio ??= agora;
      quadros += 1;
      const duracao = agora - inicio;
      if (duracao >= duracaoMs) {
        resolver((quadros - 1) * 1000 / duracao);
        return;
      }
      window.requestAnimationFrame(quadro);
    };
    window.requestAnimationFrame(quadro);
  });
}

let deteccaoPendente: Promise<NivelDeEfeitos> | undefined;

/** Lê sinais reais no cliente e publica o nível no elemento da landing. */
export function detectarCapacidadeDaLanding(): Promise<NivelDeEfeitos> {
  if (deteccaoPendente) return deteccaoPendente;
  if (typeof window === "undefined") return Promise.resolve("estatico");

  deteccaoPendente = (async () => {
    const conexao = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const ponteiroGrosso = window.matchMedia("(pointer: coarse)").matches;
    // Desktop Safari/Firefox não expõem deviceMemory; não desliga a narrativa
    // já aprovada por falta desse dado. No toque, a ausência continua cautelosa.
    const memoria = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? (ponteiroGrosso ? 0 : 8);
    const sinais: Omit<SinaisDeCapacidade, "quadrosPorSegundo"> = {
      ponteiroGrosso,
      memoriaEmGiB: memoria,
      nucleos: navigator.hardwareConcurrency ?? 0,
      economiaDeDados: conexao?.saveData === true,
      movimentoReduzido: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    };

    // Um pedido explícito ou um sinal de aparelho fraco dispensa até a medição.
    if (
      sinais.movimentoReduzido || sinais.economiaDeDados ||
      sinais.memoriaEmGiB < 4 || sinais.nucleos < 4
    ) {
      document.querySelector<HTMLElement>(".sc-lp")?.setAttribute("data-efeitos", "estatico");
      return "estatico";
    }

    const nivel = nivelDeEfeitos({ ...sinais, quadrosPorSegundo: await medirQuadrosIniciais(500) });
    document.querySelector<HTMLElement>(".sc-lp")?.setAttribute("data-efeitos", nivel);
    return nivel;
  })();
  return deteccaoPendente;
}
