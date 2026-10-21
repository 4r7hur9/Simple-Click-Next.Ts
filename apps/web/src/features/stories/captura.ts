/**
 * Captura de foto e vídeo para o Story (card #84): câmera do aparelho
 * (`getUserMedia`), tocha, gravação curta (`MediaRecorder`) e o botão redondo
 * que serve para os dois (toque = foto, segurar = vídeo).
 *
 * As partes que dependem do navegador recebem as peças de fora (o
 * `MediaRecorder`, os temporizadores), para testar sem câmera.
 */

export const DURACAO_MAXIMA_DO_VIDEO_SEGUNDOS = 15;
/** Quanto tempo segurar o botão para virar vídeo. */
export const TEMPO_PARA_SEGURAR_MS = 350;

export type LadoDaCamera = "environment" | "user";

// ---------------------------------------------------------------------------
// Pode usar a câmera?
// ---------------------------------------------------------------------------

export type SituacaoDaCamera = "disponivel" | "inseguro" | "sem-suporte";

/**
 * `getUserMedia` só existe em contexto seguro (HTTPS ou localhost). Em HTTP
 * puro o navegador nem cria `navigator.mediaDevices`.
 */
export function situacaoDaCamera(ambiente: {
  readonly isSecureContext?: boolean;
  readonly mediaDevices?: { readonly getUserMedia?: unknown } | undefined;
}): SituacaoDaCamera {
  if (ambiente.isSecureContext === false) return "inseguro";
  if (typeof ambiente.mediaDevices?.getUserMedia !== "function") {
    return ambiente.isSecureContext === true ? "sem-suporte" : "inseguro";
  }
  return "disponivel";
}

export type ProblemaDaCamera =
  | "negada"
  | "sem-camera"
  | "ocupada"
  | "inseguro"
  | "sem-suporte"
  | "falha";

/** Traduz o erro do `getUserMedia` para o que a pessoa precisa saber. */
export function classificarErroDaCamera(erro: unknown): ProblemaDaCamera {
  const nome =
    typeof erro === "object" && erro !== null && "name" in erro
      ? String((erro as { name: unknown }).name)
      : "";
  switch (nome) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "negada";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "sem-camera";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "ocupada";
    default:
      return "falha";
  }
}

export interface ExplicacaoDaCamera {
  readonly titulo: string;
  readonly texto: string;
}

export function explicarProblemaDaCamera(
  problema: ProblemaDaCamera,
): ExplicacaoDaCamera {
  switch (problema) {
    case "negada":
      return {
        titulo: "A câmera está bloqueada",
        texto:
          "Para tirar a foto na hora, libere a câmera nas permissões do navegador (o cadeado ao lado do endereço) e abra de novo. Se preferir, escolha uma foto ou vídeo da galeria.",
      };
    case "sem-camera":
      return {
        titulo: "Não achamos uma câmera",
        texto:
          "Este aparelho não tem câmera disponível. Escolha uma foto ou vídeo da galeria.",
      };
    case "ocupada":
      return {
        titulo: "A câmera está em uso",
        texto:
          "Outro aplicativo está usando a câmera. Feche-o e tente de novo, ou escolha da galeria.",
      };
    case "inseguro":
      return {
        titulo: "A câmera pede conexão segura",
        texto:
          "O navegador só liga a câmera em páginas com https:// (ou no próprio computador, em localhost). Abra o painel pelo endereço seguro, ou escolha uma foto ou vídeo da galeria.",
      };
    case "sem-suporte":
      return {
        titulo: "Este navegador não liga a câmera",
        texto:
          "Atualize o navegador para usar a câmera aqui, ou escolha uma foto ou vídeo da galeria.",
      };
    default:
      return {
        titulo: "Não deu para ligar a câmera",
        texto: "Tente de novo ou escolha uma foto ou vídeo da galeria.",
      };
  }
}

export function restricoesDaCamera(lado: LadoDaCamera): MediaStreamConstraints {
  return {
    video: {
      facingMode: { ideal: lado },
      width: { ideal: 1080 },
      height: { ideal: 1920 },
    },
    audio: false,
  };
}

// ---------------------------------------------------------------------------
// Tocha (flash)
// ---------------------------------------------------------------------------

export function tochaSuportada(faixa: MediaStreamTrack | undefined): boolean {
  if (faixa === undefined || typeof faixa.getCapabilities !== "function") {
    return false;
  }
  const capacidades = faixa.getCapabilities() as { torch?: boolean };
  return capacidades.torch === true;
}

export async function ligarTocha(
  faixa: MediaStreamTrack,
  ligada: boolean,
): Promise<boolean> {
  try {
    await faixa.applyConstraints({
      advanced: [{ torch: ligada } as MediaTrackConstraintSet],
    });
    return ligada;
  } catch {
    return false;
  }
}

export function pararCamera(fluxo: MediaStream | null): void {
  fluxo?.getTracks().forEach((faixa) => faixa.stop());
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

const TIPOS_DE_GRAVACAO = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
] as const;

/** O primeiro formato de vídeo que o navegador grava (e a API aceita: WebM ou MP4). */
export function escolherTipoDeGravacao(
  suporta: (tipo: string) => boolean,
): string | undefined {
  return TIPOS_DE_GRAVACAO.find((tipo) => {
    try {
      return suporta(tipo);
    } catch {
      return false;
    }
  });
}

/** `video/webm;codecs=vp9,opus` → `video/webm`. */
export function tipoSemCodec(tipo: string): string {
  return tipo.split(";")[0]!.trim();
}

export function fracaoDaGravacao(decorridoMs: number, maximoMs: number): number {
  if (maximoMs <= 0) return 0;
  return Math.min(1, Math.max(0, decorridoMs / maximoMs));
}

export interface Gravacao {
  readonly arquivo: Blob;
  readonly duracaoSegundos: number;
}

export interface Gravador {
  parar(): void;
  cancelar(): void;
}

export interface OpcoesDoGravador {
  readonly fluxo: MediaStream;
  readonly maximoSegundos: number;
  readonly aoProgredir: (fracao: number) => void;
  readonly aoTerminar: (gravacao: Gravacao) => void;
  readonly aoFalhar: (erro: unknown) => void;
  /** Para teste: o construtor do gravador e o relógio. */
  readonly criarGravador?: (
    fluxo: MediaStream,
    opcoes: MediaRecorderOptions,
  ) => MediaRecorder;
  readonly suporta?: (tipo: string) => boolean;
  readonly agora?: () => number;
}

/** Grava o fluxo até `parar()` ou até o limite de tempo. */
export function iniciarGravacao(opcoes: OpcoesDoGravador): Gravador {
  const suporta =
    opcoes.suporta ??
    ((tipo: string) =>
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(tipo));
  const tipo = escolherTipoDeGravacao(suporta);
  const criar =
    opcoes.criarGravador ??
    ((fluxo: MediaStream, config: MediaRecorderOptions) =>
      new MediaRecorder(fluxo, config));
  const agora = opcoes.agora ?? (() => Date.now());
  const maximoMs = opcoes.maximoSegundos * 1000;

  const pedacos: Blob[] = [];
  let cancelado = false;
  let relogio: ReturnType<typeof setInterval> | null = null;
  const inicio = agora();

  let gravador: MediaRecorder;
  try {
    gravador = criar(opcoes.fluxo, tipo === undefined ? {} : { mimeType: tipo });
  } catch (erro) {
    opcoes.aoFalhar(erro);
    return { parar() {}, cancelar() {} };
  }

  const limpar = () => {
    if (relogio !== null) clearInterval(relogio);
    relogio = null;
  };

  gravador.ondataavailable = (evento) => {
    if (evento.data.size > 0) pedacos.push(evento.data);
  };
  gravador.onerror = (evento) => {
    limpar();
    opcoes.aoFalhar(evento);
  };
  gravador.onstop = () => {
    limpar();
    if (cancelado) return;
    const duracaoSegundos = Math.min(
      opcoes.maximoSegundos,
      Math.max(0.1, (agora() - inicio) / 1000),
    );
    opcoes.aoProgredir(1);
    opcoes.aoTerminar({
      arquivo: new Blob(pedacos, {
        type: tipoSemCodec(gravador.mimeType || tipo || "video/webm"),
      }),
      duracaoSegundos,
    });
  };

  const parar = () => {
    if (gravador.state !== "inactive") gravador.stop();
  };

  gravador.start(250);
  relogio = setInterval(() => {
    const decorrido = agora() - inicio;
    opcoes.aoProgredir(fracaoDaGravacao(decorrido, maximoMs));
    if (decorrido >= maximoMs) parar();
  }, 100);

  return {
    parar,
    cancelar() {
      cancelado = true;
      parar();
      limpar();
    },
  };
}

// ---------------------------------------------------------------------------
// O botão redondo: toque = foto, segurar = vídeo
// ---------------------------------------------------------------------------

export interface BotaoDeCaptura {
  apertou(): void;
  soltou(): void;
  /** O dedo saiu da tela de repente (ligação, gesto do sistema). */
  cancelou(): void;
  /** Descarta o relógio pendente. */
  encerrar(): void;
}

export interface OpcoesDoBotao {
  readonly aoTirarFoto: () => void;
  readonly aoComecarVideo: () => void;
  readonly aoTerminarVideo: () => void;
  readonly tempoParaSegurarMs?: number;
  readonly agendar?: (tarefa: () => void, ms: number) => unknown;
  readonly desagendar?: (id: unknown) => void;
}

export function criarBotaoDeCaptura(opcoes: OpcoesDoBotao): BotaoDeCaptura {
  const agendar = opcoes.agendar ?? ((tarefa, ms) => setTimeout(tarefa, ms));
  const desagendar =
    opcoes.desagendar ??
    ((id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const espera = opcoes.tempoParaSegurarMs ?? TEMPO_PARA_SEGURAR_MS;

  let apertado = false;
  let gravando = false;
  let pendente: unknown = null;

  const limpar = () => {
    if (pendente !== null) desagendar(pendente);
    pendente = null;
  };

  return {
    apertou() {
      if (apertado) return;
      apertado = true;
      pendente = agendar(() => {
        pendente = null;
        gravando = true;
        opcoes.aoComecarVideo();
      }, espera);
    },
    soltou() {
      if (!apertado) return;
      apertado = false;
      if (gravando) {
        gravando = false;
        opcoes.aoTerminarVideo();
        return;
      }
      limpar();
      opcoes.aoTirarFoto();
    },
    cancelou() {
      if (!apertado) return;
      apertado = false;
      limpar();
      if (gravando) {
        gravando = false;
        opcoes.aoTerminarVideo();
      }
    },
    encerrar() {
      limpar();
      apertado = false;
      gravando = false;
    },
  };
}

// ---------------------------------------------------------------------------
// Foto tirada do visor
// ---------------------------------------------------------------------------

export async function fotoDoVisor(
  video: HTMLVideoElement,
  qualidade = 0.92,
): Promise<{ arquivo: Blob; largura: number; altura: number }> {
  const largura = video.videoWidth;
  const altura = video.videoHeight;
  if (largura === 0 || altura === 0) {
    throw new Error("A câmera ainda não está pronta.");
  }
  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;
  const contexto = tela.getContext("2d");
  if (contexto === null) throw new Error("Não foi possível tirar a foto.");
  contexto.drawImage(video, 0, 0, largura, altura);
  const arquivo = await new Promise<Blob | null>((pronto) =>
    tela.toBlob(pronto, "image/jpeg", qualidade),
  );
  if (arquivo === null) throw new Error("Não foi possível tirar a foto.");
  return { arquivo, largura, altura };
}
