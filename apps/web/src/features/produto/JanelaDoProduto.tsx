"use client";

/**
 * O detalhe do produto numa janela por cima do cardápio, e o "+" que adiciona
 * direto (card #20).
 *
 * A PESSOA NÃO PERDE O LUGAR. Tocar num produto abre a janela sobre o cardápio,
 * em vez de navegar para outra página: fechar devolve a rolagem exatamente onde
 * ela estava. O endereço acompanha — abrir põe `/loja/<loja>/produto/<id>` na
 * barra (link compartilhável; o "voltar" do celular fecha a janela) e fechar
 * devolve o endereço do cardápio. É a mesma lógica do Sobre.
 *
 * O LINK DIRETO CONTINUA EXISTINDO. `/loja/<loja>/produto/<id>` aberto do zero é o
 * cardápio com esta janela já aberta, desenhada no servidor (`produtoInicial`):
 * o buscador e quem está sem script veem o produto inteiro.
 *
 * OS GATILHOS SÃO LINKS COMUNS, desenhados no servidor: `data-abre-produto` no
 * cartão e `data-adicionar-produto` no "+". Um ouvinte só, no documento, pega o
 * clique de todos. Sem script, os dois só navegam para a página do produto.
 *
 * O "+" ADICIONA DIRETO só o produto SIMPLES — à venda, com preço, sem grupo
 * obrigatório e com no máximo uma variação (a bebida comum). Para os outros,
 * ele abre a janela: adicionar um pastel sem escolher o sabor seria adivinhar
 * pela pessoa.
 *
 * O PRODUTO VEM DO SERVIDOR (`carregarProduto`, uma ação de servidor que a
 * página passa), já com o preço escrito: esta camada não alcança `packages/core`
 * e não refaz conta nenhuma (P-006).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { IconeFechar } from "@simpleclick/ui";

import {
  adicionarAoCarrinho,
  avisarQueOCarrinhoMudou,
} from "../../lib/carrinho-do-navegador.ts";
import type { ProdutoNaTela } from "../../lib/produto.ts";

import { DetalheDoProduto } from "./DetalheDoProduto.tsx";

/** O id do nome do produto dentro da janela. */
const ID_DO_TITULO = "nome-do-produto-na-janela";

/** Quanto tempo o aviso de "entrou na sacola" fica na tela. */
const DURACAO_DO_AVISO = 2800;

type Situacao = "fechada" | "carregando" | "pronta" | "erro";

export interface JanelaDoProdutoProps {
  readonly apelidoDaLoja: string;
  readonly rotulos: { readonly variacao: string };
  /** O tipo de negócio da loja: escolhe o exemplo da observação do item. */
  readonly ramo?: string | null | undefined;
  /** Como a loja chama o catálogo, para o "voltar ao cardápio". */
  readonly rotuloDoCatalogo: string;
  /** Nasce aberta com este produto — é a rota `/loja/<loja>/produto/<id>`. */
  readonly produtoInicial?: ProdutoNaTela | null | undefined;
  /** Busca o produto no servidor. Nulo quando ele não existe mais. */
  readonly carregarProduto: (id: string) => Promise<ProdutoNaTela | null>;
}

/**
 * O produto pode entrar na sacola com um toque, sem escolher nada?
 *
 * Sim quando está à venda, com preço, sem grupo OBRIGATÓRIO e com no máximo uma
 * variação (a "Padrão" do refrigerante) — que precisa estar disponível. Grupo
 * opcional não impede: vai o que já viria marcado ao abrir o produto.
 */
export function eProdutoSimples(produto: ProdutoNaTela): boolean {
  if (!produto.disponivel || produto.precoCentavos === null) return false;
  if (produto.variacoes.length > 1) return false;
  const unica = produto.variacoes[0];
  if (unica !== undefined && !unica.disponivel) return false;
  return produto.grupos.every(
    (grupo) => !grupo.eixoDeVariacao && grupo.minimo === 0,
  );
}

/** O que o "+" manda: a variação única (se houver) e as opções já marcadas. */
function itemDoToqueUnico(produto: ProdutoNaTela) {
  return {
    produtoId: produto.id,
    variacaoId: produto.variacoes[0]?.id ?? null,
    quantidade: 1,
    observacao: null,
    escolhas: produto.grupos.flatMap((grupo) =>
      grupo.opcoes
        .filter((opcao) => opcao.marcadaPorPadrao && opcao.disponivel)
        .map((opcao) => ({
          grupoId: grupo.id,
          opcaoId: opcao.id,
          quantidade: 1,
        })),
    ),
    // Só para a API anotar divergência; o número que vale é o dela (P-006).
    totalVistoCentavos:
      produto.variacoes[0]?.precoCentavos ?? produto.precoCentavos ?? 0,
  };
}

function enderecoDoProduto(apelido: string, id: string): string {
  return `/loja/${apelido}/produto/${id}`;
}

/** O id do produto quando o endereço é o de um produto desta loja. */
function produtoDoEndereco(apelido: string, caminho: string): string | null {
  const prefixo = `/loja/${apelido}/produto/`;
  if (!caminho.startsWith(prefixo)) return null;
  const id = caminho.slice(prefixo.length).split("/")[0];
  return id ? decodeURIComponent(id) : null;
}

function cliqueComum(evento: MouseEvent): boolean {
  return !(
    evento.defaultPrevented ||
    evento.button !== 0 ||
    evento.metaKey ||
    evento.ctrlKey ||
    evento.shiftKey ||
    evento.altKey
  );
}

export function JanelaDoProduto({
  apelidoDaLoja,
  rotulos,
  ramo,
  rotuloDoCatalogo,
  produtoInicial = null,
  carregarProduto,
}: JanelaDoProdutoProps) {
  const janela = useRef<HTMLDialogElement>(null);
  const [produto, setProduto] = useState<ProdutoNaTela | null>(produtoInicial);
  const [situacao, setSituacao] = useState<Situacao>(
    produtoInicial ? "pronta" : "fechada",
  );
  const [aviso, setAviso] = useState<string | null>(null);
  /** Se a janela pôs uma entrada no histórico, que o fechar deve desfazer. */
  const empilhou = useRef(false);
  /** O id pedido por último: resposta atrasada de outro produto é descartada. */
  const pedido = useRef<string | null>(produtoInicial?.id ?? null);
  const guardados = useRef(new Map<string, ProdutoNaTela>());
  const ocupados = useRef(new Set<string>());
  const relogioDoAviso = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enderecoDoCatalogo = `/loja/${apelidoDaLoja}/cardapio`;

  if (produtoInicial && !guardados.current.has(produtoInicial.id)) {
    guardados.current.set(produtoInicial.id, produtoInicial);
  }

  const avisar = useCallback((texto: string) => {
    setAviso(texto);
    if (relogioDoAviso.current !== null) clearTimeout(relogioDoAviso.current);
    relogioDoAviso.current = setTimeout(() => setAviso(null), DURACAO_DO_AVISO);
  }, []);

  const buscar = useCallback(
    async (id: string): Promise<ProdutoNaTela | null> => {
      const guardado = guardados.current.get(id);
      if (guardado) return guardado;
      try {
        const achado = await carregarProduto(id);
        if (achado) guardados.current.set(id, achado);
        return achado;
      } catch {
        return null;
      }
    },
    [carregarProduto],
  );

  const mostrarJanela = useCallback(() => {
    const elemento = janela.current;
    if (!elemento || (elemento.open && elemento.matches(":modal"))) return;
    // O servidor pode ter entregado a janela aberta, mas NÃO modal: troca para
    // o modo modal, que é o que prende o foco e trava o fundo.
    if (elemento.open) elemento.close();
    elemento.showModal();
    elemento.scrollTop = 0;
  }, []);

  const abrir = useCallback(
    async (id: string, empilhar: boolean) => {
      pedido.current = id;
      const destino = enderecoDoProduto(apelidoDaLoja, id);
      if (empilhar && window.location.pathname !== destino) {
        window.history.pushState(null, "", destino);
        empilhou.current = true;
      }
      const guardado = guardados.current.get(id);
      setProduto(guardado ?? null);
      setSituacao(guardado ? "pronta" : "carregando");
      mostrarJanela();
      if (guardado) return;

      const achado = await buscar(id);
      if (pedido.current !== id) return;
      setProduto(achado);
      setSituacao(achado ? "pronta" : "erro");
    },
    [apelidoDaLoja, buscar, mostrarJanela],
  );

  const adicionarDireto = useCallback(
    async (id: string) => {
      if (ocupados.current.has(id)) return;
      ocupados.current.add(id);
      try {
        const achado = await buscar(id);
        if (achado === null) {
          avisar("Não deu para abrir este produto agora. Tente de novo.");
          return;
        }
        if (!eProdutoSimples(achado)) {
          await abrir(id, true);
          return;
        }
        const resultado = await adicionarAoCarrinho(
          apelidoDaLoja,
          itemDoToqueUnico(achado),
        );
        if (resultado.estado === "adicionado") {
          avisarQueOCarrinhoMudou();
          avisar(`${achado.nome} entrou na sacola.`);
        } else if (resultado.estado === "nao-fecha") {
          // O produto mudou desde que a página abriu: a janela mostra o de agora.
          guardados.current.delete(id);
          await abrir(id, true);
        } else {
          avisar("Não deu para adicionar agora. Tente de novo em instantes.");
        }
      } finally {
        ocupados.current.delete(id);
      }
    },
    [abrir, apelidoDaLoja, avisar, buscar],
  );

  useEffect(() => {
    const elemento = janela.current;
    if (!elemento) return;

    if (produtoInicial) mostrarJanela();

    function aoClicar(evento: MouseEvent): void {
      if (!cliqueComum(evento)) return; // abrir em outra aba é do navegador
      const alvo = evento.target;
      if (!(alvo instanceof Element)) return;

      const mais = alvo.closest<HTMLElement>("a[data-adicionar-produto]");
      if (mais) {
        evento.preventDefault();
        const id = mais.dataset["adicionarProduto"];
        if (id) void adicionarDireto(id);
        return;
      }

      const cartao = alvo.closest<HTMLElement>("a[data-abre-produto]");
      if (cartao) {
        evento.preventDefault();
        const id = cartao.dataset["abreProduto"];
        if (id) void abrir(id, true);
      }
    }

    // O "voltar" do navegador fecha a janela (e o "avançar" reabre).
    function aoVoltar(): void {
      const id = produtoDoEndereco(apelidoDaLoja, window.location.pathname);
      if (id !== null) {
        void abrir(id, false);
      } else if (elemento?.open) {
        empilhou.current = false;
        elemento.close();
      }
    }

    // Fechou por Esc, pelo botão ou pelo fundo: o endereço volta a ser o do
    // cardápio. Se fomos nós que empilhamos, desempilha; se a pessoa chegou
    // direto pelo link do produto, troca no lugar.
    function aoFechar(): void {
      if (elemento?.open) return;
      pedido.current = null;
      setSituacao("fechada");
      if (produtoDoEndereco(apelidoDaLoja, window.location.pathname) === null) {
        return;
      }
      if (empilhou.current) {
        empilhou.current = false;
        window.history.back();
      } else {
        window.history.replaceState(null, "", enderecoDoCatalogo);
      }
    }

    // Clique no FUNDO fecha: o fundo é o próprio `dialog`.
    function aoClicarNaJanela(evento: MouseEvent): void {
      if (evento.target === elemento) elemento?.close();
    }

    document.addEventListener("click", aoClicar);
    window.addEventListener("popstate", aoVoltar);
    elemento.addEventListener("close", aoFechar);
    elemento.addEventListener("click", aoClicarNaJanela);
    return () => {
      document.removeEventListener("click", aoClicar);
      window.removeEventListener("popstate", aoVoltar);
      elemento.removeEventListener("close", aoFechar);
      elemento.removeEventListener("click", aoClicarNaJanela);
    };
  }, [
    abrir,
    adicionarDireto,
    apelidoDaLoja,
    enderecoDoCatalogo,
    mostrarJanela,
    produtoInicial,
  ]);

  useEffect(
    () => () => {
      if (relogioDoAviso.current !== null) clearTimeout(relogioDoAviso.current);
    },
    [],
  );

  return (
    <>
      <dialog
        ref={janela}
        className="sc-janela-produto"
        aria-labelledby={situacao === "pronta" ? ID_DO_TITULO : undefined}
        aria-label={situacao === "pronta" ? undefined : "Produto"}
        // Aberta no servidor só na rota do produto: é o que mostra o conteúdo
        // para quem está sem script e para o buscador.
        open={produtoInicial ? true : undefined}
      >
        <div className="sc-janela-produto__moldura">
          {/*
            O fechar é um LINK para o cardápio: sem script, ele navega. Com
            script, o clique fecha a janela no lugar.
          */}
          <a
            className="sc-janela-produto__fechar"
            href={enderecoDoCatalogo}
            onClick={(evento) => {
              evento.preventDefault();
              janela.current?.close();
            }}
          >
            <IconeFechar aria-hidden="true" />
            <span className="sc-so-leitor">
              Fechar e voltar ao {rotuloDoCatalogo.toLowerCase()}
            </span>
          </a>

          {situacao === "pronta" && produto ? (
            <DetalheDoProduto
              produto={produto}
              apelidoDaLoja={apelidoDaLoja}
              rotulos={rotulos}
              ramo={ramo}
              idDoTitulo={ID_DO_TITULO}
              aoAdicionado={() => {
                avisar(`${produto.nome} entrou na sacola.`);
                janela.current?.close();
              }}
            />
          ) : situacao === "erro" ? (
            <div className="sc-janela-produto__estado" role="alert">
              <p className="sc-janela-produto__estado-titulo">
                Não deu para abrir este produto
              </p>
              <p>Ele pode ter saído do {rotuloDoCatalogo.toLowerCase()}.</p>
            </div>
          ) : (
            <div
              className="sc-janela-produto__estado"
              role="status"
              aria-live="polite"
            >
              <span
                className="sc-janela-produto__esqueleto"
                aria-hidden="true"
              />
              <p>Carregando o produto…</p>
            </div>
          )}
        </div>
      </dialog>

      {/* O aviso curto do "+": entra, diz o que aconteceu e sai sozinho. */}
      <p className="sc-aviso-rapido" role="status" aria-live="polite">
        {aviso ? <span className="sc-aviso-rapido__texto">{aviso}</span> : null}
      </p>
    </>
  );
}
