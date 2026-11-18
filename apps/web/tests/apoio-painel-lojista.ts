/** Apoio das provas do painel (card #112): lê arquivos do repositório. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
export const RAIZ_WEB = resolve(AQUI, "..");
export const ESTILOS = resolve(AQUI, "../../../packages/ui/styles");

export const PASTAS_DO_PAINEL = [
  "painel",
  "painel-catalogo",
  "painel-clientes",
  "painel-estoque",
  "painel-filtros",
  "painel-opcoes",
  "painel-pedidos",
  "painel-variacoes",
  "config",
  "dashboard",
  "equipe",
  "aprovacao",
  "tutorial",
  "comentarios",
  "stories-painel",
  "feed-config",
  "impressao",
].map((p) => join(RAIZ_WEB, "src/features", p));

export function arquivos(pasta: string, extensoes: readonly string[]): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho, extensoes);
    return extensoes.some((e) => nome.endsWith(e)) ? [caminho] : [];
  });
}

export function ler(caminho: string): string {
  return readFileSync(caminho, "utf8");
}

export function lerDaFeature(relativo: string): string {
  return ler(join(RAIZ_WEB, "src/features", relativo));
}
