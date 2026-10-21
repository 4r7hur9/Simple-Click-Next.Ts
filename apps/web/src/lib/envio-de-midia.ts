/**
 * Envio de foto e vídeo pelo painel (card #48), sobre o contrato do card #46.
 *
 * O corpo é o ARQUIVO cru (como nas fotos do produto): a API confere o tipo
 * pelos bytes, o tamanho e a duração. Aqui a tela só adianta o que dá para
 * saber antes de mandar 50 MB pela rede — tamanho, tipo declarado e duração
 * lida do `<video>` — e mostra o progresso do envio, que o `fetch` não dá
 * (por isso o envio usa `XMLHttpRequest`).
 */
import {
  LIMITES_DE_MIDIA_PADRAO,
  type LimitesDeMidia,
} from "@simpleclick/contracts";

/** Os limites enquanto `GET /v1/midia/limites` não responde. */
export const LIMITES_DE_MIDIA_INICIAIS: LimitesDeMidia = {
  videoTamanhoMaximoBytes: LIMITES_DE_MIDIA_PADRAO.videoTamanhoMaximoBytes,
  videoDuracaoMaximaSegundos: LIMITES_DE_MIDIA_PADRAO.videoDuracaoMaximaSegundos,
  videosPorProduto: LIMITES_DE_MIDIA_PADRAO.videosPorProduto,
  imagemDoStoryTamanhoMaximoBytes:
    LIMITES_DE_MIDIA_PADRAO.imagemDoStoryTamanhoMaximoBytes,
  duracaoDoStoryHoras: LIMITES_DE_MIDIA_PADRAO.duracaoDoStoryHoras,
  formatosDeVideo: ["video/mp4", "video/webm"],
  formatosDeImagem: ["image/jpeg", "image/png", "image/webp"],
};

/** Lê os limites que valem na API; se falhar, ficam os padrões do contrato. */
export async function buscarLimitesDeMidia(): Promise<LimitesDeMidia> {
  try {
    const resposta = await fetch("/api/loja/midia/limites", {
      cache: "no-store",
    });
    if (!resposta.ok) return LIMITES_DE_MIDIA_INICIAIS;
    return (await resposta.json()) as LimitesDeMidia;
  } catch {
    return LIMITES_DE_MIDIA_INICIAIS;
  }
}

/** "50 MB", "3,2 MB", "800 KB". */
export function formatarTamanho(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toLocaleString("pt-BR", { maximumFractionDigits: mb >= 10 ? 0 : 1 })} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "45 s", "1 min", "1 min 30 s". */
export function formatarDuracao(segundos: number): string {
  const inteiro = Math.round(segundos);
  if (inteiro < 60) return `${inteiro} s`;
  const minutos = Math.floor(inteiro / 60);
  const resto = inteiro % 60;
  return resto === 0 ? `${minutos} min` : `${minutos} min ${resto} s`;
}

export interface DadosDoVideo {
  /** Nula quando o navegador não sabe (webm gravado no navegador). */
  readonly duracaoSegundos: number | null;
  readonly largura: number | null;
  readonly altura: number | null;
}

/**
 * Duração e tamanho do vídeo, lidos pelo navegador. Não é prova de nada (a
 * API confere de novo): serve para recusar na hora o vídeo longo demais e
 * para mandar `?duracaoSegundos=` quando o arquivo não traz a duração.
 */
export function lerDadosDoVideo(arquivo: Blob): Promise<DadosDoVideo> {
  return new Promise((pronto) => {
    if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
      pronto({ duracaoSegundos: null, largura: null, altura: null });
      return;
    }
    const endereco = URL.createObjectURL(arquivo);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const terminar = (dados: DadosDoVideo) => {
      URL.revokeObjectURL(endereco);
      pronto(dados);
    };
    const relogio = window.setTimeout(
      () => terminar({ duracaoSegundos: null, largura: null, altura: null }),
      8_000,
    );
    const entregar = () => {
      window.clearTimeout(relogio);
      const duracao = Number.isFinite(video.duration) ? video.duration : null;
      terminar({
        duracaoSegundos: duracao !== null && duracao > 0 ? duracao : null,
        largura: video.videoWidth || null,
        altura: video.videoHeight || null,
      });
    };
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) {
        entregar();
        return;
      }
      // O webm gravado no navegador chega com duração "infinita": pular
      // para o fim faz o navegador medir o arquivo e corrigir a duração.
      video.ondurationchange = () => {
        if (!Number.isFinite(video.duration)) return;
        video.ondurationchange = null;
        entregar();
      };
      video.currentTime = Number.MAX_SAFE_INTEGER;
    };
    video.onerror = () => {
      window.clearTimeout(relogio);
      terminar({ duracaoSegundos: null, largura: null, altura: null });
    };
    video.src = endereco;
  });
}

function lerJson(texto: string): unknown {
  if (texto === "") return null;
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return null;
  }
}

/** O que a API respondeu ao envio. */
export interface RespostaDoEnvio {
  readonly status: number;
  readonly corpo: unknown;
}

/**
 * Manda o arquivo cru e avisa o progresso (0 a 1). Resolve com a resposta,
 * qualquer que seja o status; só rejeita quando a rede cai.
 */
export function enviarComProgresso(
  endereco: string,
  arquivo: Blob,
  aoProgredir: (fracao: number) => void,
  metodo: "POST" | "PUT" = "POST",
): Promise<RespostaDoEnvio> {
  return new Promise((pronto, falha) => {
    const pedido = new XMLHttpRequest();
    pedido.open(metodo, endereco);
    pedido.setRequestHeader(
      "content-type",
      arquivo.type === "" ? "application/octet-stream" : arquivo.type,
    );
    pedido.upload.onprogress = (evento) => {
      if (evento.lengthComputable && evento.total > 0) {
        aoProgredir(evento.loaded / evento.total);
      }
    };
    pedido.onload = () => {
      aoProgredir(1);
      pronto({ status: pedido.status, corpo: lerJson(pedido.responseText) });
    };
    pedido.onerror = () => falha(new Error("rede"));
    pedido.onabort = () => falha(new Error("cancelado"));
    pedido.send(arquivo);
  });
}

/** O código de erro da API (`{erro:"x"}` ou `{erro:{codigo:"x"}}`). */
export function codigoDoErro(corpo: unknown): string | null {
  if (typeof corpo !== "object" || corpo === null) return null;
  const erro = (corpo as { erro?: unknown }).erro;
  if (typeof erro === "string") return erro;
  if (typeof erro === "object" && erro !== null) {
    const codigo = (erro as { codigo?: unknown }).codigo;
    if (typeof codigo === "string") return codigo;
  }
  return null;
}

/** A frase da API para o erro, quando ela mandou uma. */
function mensagemDoErro(corpo: unknown): string | null {
  if (typeof corpo !== "object" || corpo === null) return null;
  const direta = (corpo as { mensagem?: unknown }).mensagem;
  if (typeof direta === "string" && direta !== "") return direta;
  const erro = (corpo as { erro?: unknown }).erro;
  if (typeof erro === "object" && erro !== null) {
    const dentro = (erro as { mensagem?: unknown }).mensagem;
    if (typeof dentro === "string" && dentro !== "") return dentro;
  }
  return null;
}

/** Explica a recusa do envio em português simples. */
export function explicarRecusaDoEnvio(
  resposta: RespostaDoEnvio,
  limites: LimitesDeMidia,
): string {
  const codigo = codigoDoErro(resposta.corpo);
  if (resposta.status === 503 || codigo === "midia_indisponivel") {
    return "O envio de arquivos está fora do ar agora. Tente de novo em alguns minutos.";
  }
  if (resposta.status === 413) {
    return `O arquivo é grande demais. O vídeo pode ter até ${formatarTamanho(limites.videoTamanhoMaximoBytes)} e a foto até ${formatarTamanho(limites.imagemDoStoryTamanhoMaximoBytes)}.`;
  }
  // O freio dos documentos legais (card #79): a conta precisa aceitar a versão
  // nova antes de criar qualquer coisa. Sem esta frase, o dono lia "sem
  // permissão" e ficava sem saber o que fazer.
  if (codigo === "aceite_pendente") {
    return "Os Termos de Uso e a Política de Privacidade foram atualizados. Aceite a nova versão para voltar a enviar arquivos.";
  }
  if (resposta.status === 403) {
    return "Sua conta não tem permissão para enviar mídia nesta loja.";
  }
  if (codigo === "limite_atingido") {
    return "A loja chegou ao limite de stories no ar. Apague um story para postar outro.";
  }
  return (
    mensagemDoErro(resposta.corpo) ??
    "Não foi possível enviar o arquivo. Tente de novo."
  );
}
