/**
 * Regras de apresentação do contrato e dos documentos da loja (AC-203 a
 * AC-205), sem React.
 *
 * Nada aqui decide se um arquivo é aceito: quem confere o tipo PELOS BYTES e
 * o tamanho é a API (AC-204). A tela só evita mandar pela rede, à toa, o que
 * certamente seria recusado — o arquivo vazio e o que passa do limite — e
 * avisa antes, na língua de quem administra.
 */

import {
  LIMITE_DA_IMAGEM_EM_BYTES,
  LIMITE_DO_PDF_EM_BYTES,
  type TipoDeDocumentoDaLoja,
} from "@simpleclick/contracts";

/** O endereço da lista e do envio no próprio site. */
export function enderecoDosDocumentos(lojaId: string): string {
  return `/api/admin/lojas/${encodeURIComponent(lojaId)}/documentos`;
}

/** O endereço que gera o link temporário de um documento, no clique. */
export function enderecoDoLinkDoDocumento(
  lojaId: string,
  documentoId: string,
): string {
  return `${enderecoDosDocumentos(lojaId)}/${encodeURIComponent(documentoId)}/link`;
}

/** A tela dos documentos, a partir da ficha. */
export function telaDosDocumentos(lojaId: string): string {
  return `/admin/lojas/${encodeURIComponent(lojaId)}/documentos`;
}

/** O link como a API o devolve: `/v1/admin/arquivos/<carga>.<assinatura>`. */
const LINK_DA_API = /^\/v1\/admin\/arquivos\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;

/**
 * O link temporário que a API devolve aponta para ELA (`/v1/admin/...`); a
 * página só fala com o próprio site, que repassa com o token do cookie
 * (`/api/admin/...`). Link fora do formato não vira endereço nenhum.
 */
export function enderecoDoArquivoNoSite(linkDaApi: string): string | null {
  const achado = LINK_DA_API.exec(linkDaApi);
  return achado === null ? null : `/api/admin/arquivos/${achado[1] ?? ""}`;
}

const numero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** O tamanho como a pessoa lê: "820 bytes", "34,5 KB", "1,2 MB". */
export function tamanhoNaTela(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  if (bytes < 1024 * 1024) return `${numero.format(bytes / 1024)} KB`;
  return `${numero.format(bytes / (1024 * 1024))} MB`;
}

/** O que o seletor de arquivo sugere para cada documento. */
export function formatosDoSeletor(tipo: TipoDeDocumentoDaLoja): string {
  return tipo === "CONTRATO"
    ? "application/pdf,.pdf"
    : "application/pdf,.pdf,image/png,.png,image/jpeg,.jpg,.jpeg";
}

/** O arquivo escolhido, só no que a tela confere antes de enviar. */
export interface ArquivoEscolhido {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

/**
 * Confere o óbvio antes de mandar: nenhum arquivo, arquivo vazio e arquivo
 * acima do limite (ASM-202). Devolve a mensagem da recusa, ou `null`.
 *
 * O limite da imagem só vale quando o navegador diz que é imagem; a palavra
 * final é da API, que lê os bytes.
 */
export function recusaAntesDeEnviar(
  tipo: TipoDeDocumentoDaLoja,
  arquivo: ArquivoEscolhido | null,
): string | null {
  if (arquivo === null) return "Escolha o arquivo do documento.";
  if (arquivo.size === 0) {
    return "O arquivo está vazio. Escolha o arquivo de novo.";
  }
  const imagem = tipo !== "CONTRATO" && arquivo.type.startsWith("image/");
  const limite = imagem ? LIMITE_DA_IMAGEM_EM_BYTES : LIMITE_DO_PDF_EM_BYTES;
  if (arquivo.size > limite) {
    const megas = limite / (1024 * 1024);
    return `O arquivo passa do limite de ${megas} MB${imagem ? " para imagem" : ""}. Nada foi enviado.`;
  }
  return null;
}
