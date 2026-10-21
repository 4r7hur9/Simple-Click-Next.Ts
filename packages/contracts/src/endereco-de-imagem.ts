/**
 * Que endereço de imagem a loja aceita guardar.
 *
 * Em produção, só `https://`: a vitrine não carrega conteúdo misto.
 *
 * Fora de produção, também:
 *
 * - o endereço da própria máquina (`http://localhost:3001/...`), onde a API
 *   guarda o arquivo enviado quando não há Cloudinary — sem isso, a imagem
 *   enviada no desenvolvimento seria recusada ao salvar;
 * - o caminho dentro do próprio site (`/demo/...`, `/capas-padrao/...`), que é
 *   como as lojas de demonstração guardam as imagens do seed. Sem ele, o
 *   "Salvar e publicar" de toda loja de demonstração respondia 400 — e nada,
 *   nem a imagem nova, chegava a ser salvo.
 */

/**
 * O pacote não depende dos tipos do Node (o site o compila sem eles): só a
 * forma de `process.env.NODE_ENV`, que o Next também troca no navegador.
 */
declare const process: { readonly env: { readonly NODE_ENV?: string } };

/** Verdadeiro fora de produção. Lido a cada chamada (os testes mudam o ambiente). */
function foraDeProducao(): boolean {
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    // Sem `process` (navegador sem o Next): na dúvida, o padrão rígido.
    return false;
  }
}

/** `http://localhost`, `http://127.0.0.1` ou `http://[::1]`, com ou sem porta. */
const ENDERECO_DA_PROPRIA_MAQUINA =
  /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?\//;

/** Imagens que moram na pasta pública do próprio site. */
const CAMINHO_DO_SITE = /^\/(demo|capas-padrao|banners-demo)\/[\w./-]+$/;

export function ehEnderecoDeImagem(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  if (valor.startsWith("https://")) {
    try {
      new URL(valor);
      return true;
    } catch {
      return false;
    }
  }
  if (!foraDeProducao()) return false;
  return (
    ENDERECO_DA_PROPRIA_MAQUINA.test(valor) ||
    (CAMINHO_DO_SITE.test(valor) && !valor.includes(".."))
  );
}
