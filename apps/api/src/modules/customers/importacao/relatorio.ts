/**
 * O relatório de erros da importação em CSV (card #60).
 *
 * Feito para abrir no Excel brasileiro com dois cliques: UTF-8 COM MARCA (sem
 * ela o Excel lê "ã" como "Ã£"), separador ";" e fim de linha CRLF. Célula
 * que começa com "=", "+", "-" ou "@" e não é número ganha um apóstrofo na
 * frente — senão a planilha a executa como fórmula (injeção de CSV).
 */
import type { LinhaDoRelatorioDaImportacao } from "@simpleclick/contracts";

const ROTULOS_DAS_SITUACOES: Readonly<
  Record<LinhaDoRelatorioDaImportacao["situacao"], string>
> = {
  invalido: "inválido",
  repetido: "repetido",
  fora_do_limite: "fora do limite",
};

function celula(valor: string | number | null): string {
  let texto = valor === null ? "" : String(valor);
  if (/^[=+\-@\t\r]/.test(texto) && !/^[+-]?[\d\s().-]+$/.test(texto)) {
    texto = `'${texto}`;
  }
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function relatorioEmCsv(
  linhas: readonly LinhaDoRelatorioDaImportacao[],
): string {
  const cabecalho = [
    "linha",
    "situacao",
    "motivo",
    "nome",
    "telefone",
    "email",
  ];
  const corpo = [...linhas]
    .sort((a, b) => a.linha - b.linha)
    .map((linha) =>
      [
        linha.linha,
        ROTULOS_DAS_SITUACOES[linha.situacao],
        linha.motivo,
        linha.nome,
        linha.telefone,
        linha.email,
      ]
        .map(celula)
        .join(";"),
    );
  return `\uFEFF${[cabecalho.join(";"), ...corpo].join("\r\n")}\r\n`;
}

/** "clientes.xlsx" → "clientes-erros.csv". */
export function nomeDoRelatorio(nomeDoArquivo: string | null): string {
  // Só ASCII: o nome vai no cabeçalho `content-disposition`.
  const base = (nomeDoArquivo ?? "importacao")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "importacao"}-erros.csv`;
}
