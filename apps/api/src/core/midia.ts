/**
 * Onde a mídia da loja é guardada — logo e capa (decisão D2: Cloudinary).
 *
 * A API NÃO SERVE IMAGEM. Ela confere o arquivo e o entrega ao serviço de
 * mídia, que devolve um endereço público e cuida de entregar a imagem no
 * tamanho de cada aparelho. O que fica na configuração da loja é só esse
 * endereço — nunca os bytes.
 *
 * É UMA PORTA, e não uma dependência solta: o módulo da loja recebe um
 * `ArmazenamentoDeImagens`, e a prova troca por um que guarda em memória.
 * Sem credencial no ambiente, a porta responde "indisponível" em vez de
 * inventar um endereço — e a tela oferece o caminho de colar um endereço
 * https:// já hospedado.
 *
 * A CREDENCIAL VEM DO AMBIENTE (P-002), no formato que o próprio serviço
 * publica: `CLOUDINARY_URL=cloudinary://<chave>:<segredo>@<nuvem>`.
 */
import { createHash } from "node:crypto";

/** A imagem, já conferida, pronta para ser guardada. */
export interface ImagemParaGuardar {
  readonly lojaId: string;
  /** "logo" ou "capa": vira parte do nome do arquivo no serviço. */
  readonly nome: string;
  readonly bytes: Uint8Array;
  /** "image/png", "image/jpeg", "image/webp". */
  readonly tipoDeConteudo: string;
}

/** Onde guardar. Devolve o endereço público, sempre https. */
export interface ArmazenamentoDeImagens {
  guardar(imagem: ImagemParaGuardar): Promise<{ readonly url: string }>;
}

/** Não há serviço de mídia configurado neste ambiente. */
export class ErroDeArmazenamentoIndisponivel extends Error {
  constructor() {
    super(
      "Envio de arquivo indisponível neste ambiente: CLOUDINARY_URL não está configurada.",
    );
    this.name = "ErroDeArmazenamentoIndisponivel";
  }
}

/** As três partes da credencial do serviço. */
export interface CredenciaisDoCloudinary {
  readonly nuvem: string;
  readonly chave: string;
  readonly segredo: string;
}

/**
 * Lê `cloudinary://<chave>:<segredo>@<nuvem>`. Ausente → nulo; malformada →
 * erro que diz o formato, porque credencial torta falharia só no primeiro
 * envio, na mão do dono.
 */
export function credenciaisDoCloudinary(
  valor: string | undefined,
): CredenciaisDoCloudinary | null {
  const bruto = valor?.trim();
  if (bruto === undefined || bruto === "") return null;
  try {
    const endereco = new URL(bruto);
    const credenciais = {
      nuvem: endereco.hostname,
      chave: decodeURIComponent(endereco.username),
      segredo: decodeURIComponent(endereco.password),
    };
    if (
      endereco.protocol !== "cloudinary:" ||
      Object.values(credenciais).some((parte) => parte === "")
    ) {
      throw new Error("partes faltando");
    }
    return credenciais;
  } catch {
    throw new Error(
      "CLOUDINARY_URL malformada. Use o formato cloudinary://<chave>:<segredo>@<nuvem>.",
    );
  }
}

/**
 * A assinatura de um envio, como o serviço a confere: os parâmetros em ordem
 * alfabética, `chave=valor` unidos por `&`, seguidos do segredo, em SHA-1.
 */
export function assinarEnvio(
  parametros: Readonly<Record<string, string>>,
  segredo: string,
): string {
  const texto = Object.keys(parametros)
    .sort()
    .map((chave) => `${chave}=${parametros[chave] ?? ""}`)
    .join("&");
  return createHash("sha1")
    .update(texto + segredo)
    .digest("hex");
}

/** O envio assinado para o Cloudinary. */
export function armazenamentoNoCloudinary(
  credenciais: CredenciaisDoCloudinary,
  buscar: typeof fetch = fetch,
  agora: () => Date = () => new Date(),
): ArmazenamentoDeImagens {
  return {
    async guardar(imagem) {
      const carimbo = String(Math.floor(agora().getTime() / 1_000));
      const parametros = {
        folder: `lojas/${imagem.lojaId}`,
        public_id: `${imagem.nome}-${carimbo}`,
        timestamp: carimbo,
      };
      const corpo = new URLSearchParams({
        ...parametros,
        file: `data:${imagem.tipoDeConteudo};base64,${Buffer.from(imagem.bytes).toString("base64")}`,
        api_key: credenciais.chave,
        signature: assinarEnvio(parametros, credenciais.segredo),
      });

      const resposta = await buscar(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(credenciais.nuvem)}/image/upload`,
        { method: "POST", body: corpo },
      );
      if (!resposta.ok) {
        throw new Error(`o serviço de mídia respondeu ${resposta.status}`);
      }
      const devolvido = (await resposta.json()) as { secure_url?: unknown };
      const url = devolvido.secure_url;
      if (typeof url !== "string" || !url.startsWith("https://")) {
        throw new Error("o serviço de mídia não devolveu um endereço https");
      }
      return { url };
    },
  };
}

/** O armazenamento que o ambiente oferece — ou um que responde indisponível. */
export function armazenamentoDoAmbiente(
  fonte: Readonly<Record<string, string | undefined>> = process.env,
): ArmazenamentoDeImagens {
  const credenciais = credenciaisDoCloudinary(fonte["CLOUDINARY_URL"]);
  if (credenciais === null) {
    return {
      guardar: async () => {
        throw new ErroDeArmazenamentoIndisponivel();
      },
    };
  }
  return armazenamentoNoCloudinary(credenciais);
}
