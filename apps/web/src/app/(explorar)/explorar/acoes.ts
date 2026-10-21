"use server";

/**
 * As ações do feed social (card #49): mais posts (rolagem infinita), curtir,
 * favoritar produto, ler e escrever comentários. A tela as recebe por
 * propriedade (`AcoesDoFeed`) e nunca fala com a API direto.
 *
 * Tudo que chega do navegador é conferido aqui: identificador de produto,
 * tamanho do comentário e os filtros (relidos por `lerConsulta`).
 */
import {
  lerComentario,
  lerComentarios,
  TAMANHO_MAXIMO_DO_COMENTARIO,
  type Comentario,
  type ResultadoDaAcao,
} from "../../../features/feed/social.ts";
import { lerConsulta } from "../../../features/feed/consulta.ts";
import {
  CAMINHOS_SOCIAIS,
  chamarApiSocial,
  type RespostaSocial,
} from "../../../server/feed-social.ts";
import { conteudoDasLojas, conteudoDosProdutos, tokenDaSessao } from "./_dados.ts";

const ID_DE_PRODUTO = /^[A-Za-z0-9_-]{1,64}$/;

function falha<T>(lido: Exclude<RespostaSocial, { estado: "ok" }>): ResultadoDaAcao<T> {
  if (lido.estado === "nao-autenticado") return { ok: false, motivo: "precisa-entrar" };
  if (lido.estado === "recusado") {
    return lido.mensagem === undefined
      ? { ok: false, motivo: "recusado" }
      : { ok: false, motivo: "recusado", mensagem: lido.mensagem };
  }
  return { ok: false, motivo: "indisponivel" };
}

export async function maisPosts(
  parametros: Readonly<Record<string, string>>,
  pagina: number,
): Promise<ResultadoDaAcao<{ readonly itens: readonly unknown[]; readonly total: number }>> {
  if (!Number.isInteger(pagina) || pagina < 2 || pagina > 1000) {
    return { ok: false, motivo: "recusado" };
  }
  const consulta = { ...lerConsulta("produtos", parametros), pagina };
  const conteudo = await conteudoDosProdutos(consulta);
  if (conteudo.estado !== "produtos") return { ok: false, motivo: "indisponivel" };
  return { ok: true, dados: { itens: conteudo.itens, total: conteudo.total } };
}

export async function maisLojas(
  parametros: Readonly<Record<string, string>>,
  pagina: number,
): Promise<ResultadoDaAcao<{ readonly itens: readonly unknown[]; readonly total: number }>> {
  if (!Number.isInteger(pagina) || pagina < 2 || pagina > 1000) {
    return { ok: false, motivo: "recusado" };
  }
  // Só a lista "todas" é paginada; favoritas e recentes vêm inteiras.
  const consulta = { ...lerConsulta("lojas", parametros), lista: "todas" as const, pagina };
  const conteudo = await conteudoDasLojas(consulta, await tokenDaSessao());
  if (conteudo.estado !== "lojas") return { ok: false, motivo: "indisponivel" };
  return { ok: true, dados: { itens: conteudo.itens, total: conteudo.total } };
}

const APELIDO_DE_LOJA = /^[a-z0-9-]{1,63}$/;

export async function curtirLoja(
  apelido: string,
  quer: boolean,
): Promise<ResultadoDaAcao<{ readonly curtidas: number | null; readonly curtiu: boolean }>> {
  if (!APELIDO_DE_LOJA.test(apelido)) return { ok: false, motivo: "recusado" };
  const token = await tokenDaSessao();
  if (token === undefined) return { ok: false, motivo: "precisa-entrar" };
  const lido = await chamarApiSocial(CAMINHOS_SOCIAIS.curtidaDaLoja(apelido), {
    metodo: quer ? "POST" : "DELETE",
    token,
  });
  if (lido.estado !== "ok") return falha(lido);
  const corpo = lido.corpo as { curtidas?: unknown; curtiu?: unknown } | null;
  return {
    ok: true,
    dados: {
      curtidas: typeof corpo?.curtidas === "number" ? corpo.curtidas : null,
      curtiu: typeof corpo?.curtiu === "boolean" ? corpo.curtiu : quer,
    },
  };
}

export async function curtir(
  produtoId: string,
  quer: boolean,
): Promise<ResultadoDaAcao<{ readonly curtidas: number | null; readonly curtiu: boolean }>> {
  if (!ID_DE_PRODUTO.test(produtoId)) return { ok: false, motivo: "recusado" };
  const token = await tokenDaSessao();
  if (token === undefined) return { ok: false, motivo: "precisa-entrar" };
  const lido = await chamarApiSocial(CAMINHOS_SOCIAIS.curtida(produtoId), {
    metodo: quer ? "POST" : "DELETE",
    token,
  });
  if (lido.estado !== "ok") return falha(lido);
  const corpo = lido.corpo as { curtidas?: unknown; curtiu?: unknown } | null;
  return {
    ok: true,
    dados: {
      curtidas: typeof corpo?.curtidas === "number" ? corpo.curtidas : null,
      curtiu: typeof corpo?.curtiu === "boolean" ? corpo.curtiu : quer,
    },
  };
}

export async function favoritarProduto(
  produtoId: string,
  quer: boolean,
): Promise<ResultadoDaAcao<{ readonly favorito: boolean }>> {
  if (!ID_DE_PRODUTO.test(produtoId)) return { ok: false, motivo: "recusado" };
  const token = await tokenDaSessao();
  if (token === undefined) return { ok: false, motivo: "precisa-entrar" };
  const lido = await chamarApiSocial(CAMINHOS_SOCIAIS.favoritoDeProduto(produtoId), {
    metodo: quer ? "POST" : "DELETE",
    token,
  });
  if (lido.estado !== "ok") return falha(lido);
  const corpo = lido.corpo as { favorito?: unknown } | null;
  return {
    ok: true,
    dados: { favorito: typeof corpo?.favorito === "boolean" ? corpo.favorito : quer },
  };
}

export async function comentarios(
  produtoId: string,
): Promise<ResultadoDaAcao<readonly Comentario[]>> {
  if (!ID_DE_PRODUTO.test(produtoId)) return { ok: false, motivo: "recusado" };
  // Com sessão, a API devolve também os pendentes da própria pessoa.
  const token = await tokenDaSessao();
  let lido = await chamarApiSocial(CAMINHOS_SOCIAIS.comentarios(produtoId), { token });
  if (lido.estado === "nao-autenticado" && token !== undefined) {
    lido = await chamarApiSocial(CAMINHOS_SOCIAIS.comentarios(produtoId));
  }
  if (lido.estado !== "ok") return falha(lido);
  return { ok: true, dados: lerComentarios(lido.corpo) };
}

export async function comentar(
  produtoId: string,
  texto: string,
): Promise<ResultadoDaAcao<Comentario>> {
  const limpo = typeof texto === "string" ? texto.trim() : "";
  if (!ID_DE_PRODUTO.test(produtoId) || limpo === "" || limpo.length > TAMANHO_MAXIMO_DO_COMENTARIO) {
    return { ok: false, motivo: "recusado", mensagem: "Escreva um comentário de até 500 caracteres." };
  }
  const token = await tokenDaSessao();
  if (token === undefined) return { ok: false, motivo: "precisa-entrar" };
  const lido = await chamarApiSocial(CAMINHOS_SOCIAIS.comentarios(produtoId), {
    metodo: "POST",
    token,
    corpo: { texto: limpo },
  });
  if (lido.estado !== "ok") return falha(lido);
  const bruto = (lido.corpo as { comentario?: unknown } | null)?.comentario ?? lido.corpo;
  const lidoDaApi = lerComentario(bruto);
  // Comentário novo sempre espera a loja aprovar, e é da própria pessoa.
  const comentario: Comentario = lidoDaApi
    ? { ...lidoDaApi, meu: true }
    : {
        id: `novo-${Date.now()}`,
        autor: "Você",
        texto: limpo,
        criadoEm: new Date().toISOString(),
        situacao: "pendente",
        meu: true,
      };
  return { ok: true, dados: comentario };
}

export async function storyVisto(storyId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(storyId)) return;
  const token = await tokenDaSessao();
  if (token === undefined) return;
  await chamarApiSocial(CAMINHOS_SOCIAIS.storyVisto(storyId), { metodo: "POST", token });
}
