/**
 * Onde moram os arquivos sigilosos da loja — contrato e documentos do
 * responsável (AC-203 a AC-205).
 *
 * É UMA PORTA, como a da mídia (`core/midia.ts`), e não uma dependência
 * solta: o caso de uso recebe um `ArmazenamentoPrivado`, e a prova troca por
 * um que guarda em memória. A diferença para a mídia é o que está em jogo:
 * imagem de produto é pública por natureza; contrato e documento de
 * identidade NUNCA são. Por isso nada aqui devolve endereço público — quem
 * entrega o arquivo é a API, pela rota da administração, depois de conferir a
 * sessão e o link temporário.
 *
 * QUAL SERVIÇO GUARDA OS BYTES EM PRODUÇÃO É DECISÃO PENDENTE (D2b em
 * `.spec/design/decisoes.md`): o Cloudinary cobre a mídia e não o documento
 * sensível, e o plano gratuito da hospedagem não garante disco persistente
 * (ASM-201). Enquanto a decisão não vem, o padrão é o armazenamento que
 * RESPONDE INDISPONÍVEL — o envio falha alto e diz por quê, em vez de gravar
 * num lugar que some no próximo deploy. O armazenamento em disco existe só
 * para o ambiente local e para a prova de ponta a ponta, e recusa produção.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** O arquivo como ele é guardado: os bytes e o tipo conferido pelo conteúdo. */
export interface ArquivoPrivado {
  readonly bytes: Uint8Array;
  readonly tipoDeConteudo: string;
}

export interface ArmazenamentoPrivado {
  guardar(chave: string, arquivo: ArquivoPrivado): Promise<void>;
  /** `null` quando não há arquivo com aquela chave. */
  ler(chave: string): Promise<ArquivoPrivado | null>;
  apagar(chave: string): Promise<void>;
}

/** Nenhum armazenamento privado configurado neste ambiente. */
export class ErroDeArmazenamentoPrivadoIndisponivel extends Error {
  constructor() {
    super(
      "Armazenamento de documentos indisponível neste ambiente: o serviço que guarda contrato e documentos ainda não foi configurado (decisão D2b).",
    );
    this.name = "ErroDeArmazenamentoPrivadoIndisponivel";
  }
}

/**
 * A chave é gerada pelo servidor — loja e identificador aleatório, nada do
 * nome original. Conferir o formato fecha a porta para um caminho montado
 * com `..` chegar ao disco.
 */
const FORMATO_DA_CHAVE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function exigirChave(chave: string): string {
  if (!FORMATO_DA_CHAVE.test(chave)) {
    throw new Error("chave de arquivo privado fora do formato");
  }
  return chave;
}

/** Guarda em memória. Serve à prova, e só a ela. */
export function armazenamentoPrivadoEmMemoria(): ArmazenamentoPrivado & {
  readonly chaves: () => readonly string[];
} {
  const arquivos = new Map<string, ArquivoPrivado>();
  return {
    async guardar(chave, arquivo) {
      arquivos.set(exigirChave(chave), {
        bytes: new Uint8Array(arquivo.bytes),
        tipoDeConteudo: arquivo.tipoDeConteudo,
      });
    },
    async ler(chave) {
      return arquivos.get(exigirChave(chave)) ?? null;
    },
    async apagar(chave) {
      arquivos.delete(exigirChave(chave));
    },
    chaves: () => [...arquivos.keys()],
  };
}

/**
 * Guarda numa pasta do disco local. SÓ para desenvolvimento e para a prova
 * de ponta a ponta: em produção o disco do contêiner some a cada deploy, e o
 * contrato sumiria junto.
 */
export function armazenamentoPrivadoNoDisco(
  pasta: string,
): ArmazenamentoPrivado {
  const caminho = (chave: string) => join(pasta, exigirChave(chave));
  const tipoDe = (chave: string) => `${caminho(chave)}.tipo`;
  return {
    async guardar(chave, arquivo) {
      await mkdir(dirname(caminho(chave)), { recursive: true });
      await writeFile(caminho(chave), arquivo.bytes);
      await writeFile(tipoDe(chave), arquivo.tipoDeConteudo, "utf8");
    },
    async ler(chave) {
      try {
        const [bytes, tipoDeConteudo] = await Promise.all([
          readFile(caminho(chave)),
          readFile(tipoDe(chave), "utf8"),
        ]);
        return { bytes: new Uint8Array(bytes), tipoDeConteudo };
      } catch {
        return null;
      }
    },
    async apagar(chave) {
      await rm(caminho(chave), { force: true });
      await rm(tipoDe(chave), { force: true });
    },
  };
}

/** O armazenamento que responde indisponível a tudo. */
export function armazenamentoPrivadoIndisponivel(): ArmazenamentoPrivado {
  const falhar = async (): Promise<never> => {
    throw new ErroDeArmazenamentoPrivadoIndisponivel();
  };
  return { guardar: falhar, ler: falhar, apagar: falhar };
}

/**
 * O armazenamento que o ambiente oferece.
 *
 * `ARMAZENAMENTO_PRIVADO_DIR` liga o disco local — e é ignorado em produção,
 * de propósito. Sem ele, indisponível.
 */
export function armazenamentoPrivadoDoAmbiente(
  fonte: Readonly<Record<string, string | undefined>> = process.env,
): ArmazenamentoPrivado {
  const pasta = fonte["ARMAZENAMENTO_PRIVADO_DIR"]?.trim();
  if (
    pasta !== undefined &&
    pasta !== "" &&
    fonte["NODE_ENV"] !== "production"
  ) {
    return armazenamentoPrivadoNoDisco(pasta);
  }
  return armazenamentoPrivadoIndisponivel();
}
