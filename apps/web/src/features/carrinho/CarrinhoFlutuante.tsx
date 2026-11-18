"use client";

/**
 * A sacola da loja: a ilha que decide QUE FORMA ela tem e cuida do que é comum
 * a todas (card #110).
 *
 * UMA SACOLA, TRÊS APARÊNCIAS, UM ESTADO SÓ:
 *
 * - NO COMPUTADOR, a coluna lateral (`ColunaDaSacola`), levada por portal à
 *   região `.sc-catalogo__sacola` que o catálogo reserva. É uma região, e não
 *   um diálogo: o foco entra e sai dela, e Esc não faz nada.
 * - NO CELULAR E NO TABLET, a barra fixa (`BarraDaSacola`), que só existe com
 *   itens e abre a sacola num diálogo modal.
 * - O DIÁLOGO é um `<dialog>` de verdade: prende o foco, fecha com Esc e
 *   devolve o foco ao botão que o abriu. Tem dois passos, a sacola e o
 *   fechamento (`PassoDoFechamento`). `/loja/<loja>/checkout` abre já no
 *   segundo.
 *
 * A ILHA FICA NO FIM DA TELA, e não dentro da região do catálogo: a barra é
 * `position: fixed` e some junto com a região (`display: none` abaixo de
 * 1280px). Só a coluna vai à região.
 *
 * O ESTADO TEM UMA FONTE: um `useCarrinho`, que só carrega as linhas quando
 * alguém as vê (coluna à mostra ou diálogo aberto). Com a barra e o diálogo
 * fechados, basta a contagem e o total. Tudo vem da conferência da API: o
 * carrinho guarda só identificadores, e nome e preço de agora são dela (P-006).
 *
 * SEM SCRIPT, nada disto aparece, e a página não perde nada: a barra do topo
 * continua com o link da sacola, que leva ao fechamento. A sacola NUNCA vai no
 * HTML do servidor (AC-11026): ela é lida no navegador, sem cache.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AvisoFlutuante } from "@simpleclick/ui";

import {
  AVISO_DE_CARRINHO_MUDOU,
  EVENTO_ABRIR_SACOLA,
  type PedidoDeAbrirASacola,
  avisarQueOCarrinhoMudou,
  mudarQuantidadeNoCarrinho,
} from "../../lib/carrinho-do-navegador.ts";
import { ID_DO_TITULO_DO_FECHAMENTO } from "../checkout/FechamentoDaCompra.tsx";
import {
  criarArquivoDeTentativas,
  type ArquivoDeTentativas,
} from "../checkout/chave-do-fechamento.ts";
import { PassoDoFechamento } from "../checkout/PassoDoFechamento.tsx";
import type { PrepararFechamento } from "../checkout/preparo-do-fechamento.ts";

import { BarraDaSacola } from "./BarraDaSacola.tsx";
import { ColunaDaSacola } from "./ColunaDaSacola.tsx";
import { GavetaCarrinho, ID_DO_TITULO_DO_CARRINHO } from "./GavetaCarrinho.tsx";
import { useFormaDaSacola } from "./forma-da-sacola.ts";
import {
  lerResumoDaSacola,
  verPelaConferencia,
  type CacheDeProdutos,
  type CarregarProduto,
  type ResumoDaSacola,
} from "./ver-pela-conferencia.ts";
import {
  useCarrinho,
  type ServicoDoCarrinho,
  type UsoDoCarrinho,
} from "./useCarrinho.ts";

export type { CarregarProduto } from "./ver-pela-conferencia.ts";

export interface CarrinhoFlutuanteProps {
  readonly apelidoDaLoja: string;
  /** Como a loja chama o catálogo: "Cardápio", "Catálogo". */
  readonly rotuloDoCatalogo: string;
  /**
   * Quem traz o detalhe do produto (a mesma ação de servidor da janela do
   * produto). Opcional: sem ela, cada item mostra o que o carrinho guarda —
   * opções e observação —, só sem o preço das opções, a descrição e a foto.
   */
  readonly carregarProduto?: CarregarProduto | undefined;
  /**
   * Quem prepara o fechamento (configuração da loja e conta logada), já preso
   * ao apelido. Sem ela, "Fechar pedido" vai ao endereço do checkout.
   */
  readonly prepararFechamento?: PrepararFechamento | undefined;
  /** Abre o diálogo já no fechamento — a rota `/loja/<loja>/checkout`. */
  readonly abrirNoFechamento?: boolean | undefined;
  /** Abre a sacola — a rota `/loja/<loja>/carrinho`. */
  readonly abrirNoCarrinho?: boolean | undefined;
}

/** Os dois passos do diálogo. */
type PassoDaJanela = "carrinho" | "fechamento";

/** O título da página, para onde o foco vai quando não sobra outro lugar. */
function tituloDaPagina(): HTMLElement | null {
  const titulo = document.querySelector<HTMLElement>("h1");
  if (titulo !== null && !titulo.hasAttribute("tabindex")) {
    titulo.setAttribute("tabindex", "-1");
  }
  return titulo;
}

/** O foco está "perdido": no corpo da página, ou num elemento que saiu dela. */
function focoPerdido(): boolean {
  const ativo = document.activeElement;
  return (
    ativo === null || ativo === document.body || !document.body.contains(ativo)
  );
}

/** O conteúdo do diálogo. Só existe enquanto ele está aberto. */
function ConteudoDoDialogo({
  carrinho,
  apelidoDaLoja,
  linkDoCatalogo,
  linkDoFechamento,
  rotuloDoCatalogo,
  prepararFechamento,
  tentativas,
  passo,
  aoMudarPasso,
  aoVoltar,
  aoFecharJanela,
}: {
  readonly carrinho: UsoDoCarrinho;
  readonly apelidoDaLoja: string;
  readonly linkDoCatalogo: string;
  readonly linkDoFechamento: string;
  readonly rotuloDoCatalogo: string;
  readonly prepararFechamento?: PrepararFechamento | undefined;
  readonly tentativas: ArquivoDeTentativas;
  readonly passo: PassoDaJanela;
  readonly aoMudarPasso: (passo: PassoDaJanela) => void;
  readonly aoVoltar: () => void;
  readonly aoFecharJanela: () => void;
}) {
  if (passo === "fechamento" && prepararFechamento) {
    return (
      <PassoDoFechamento
        apelidoDaLoja={apelidoDaLoja}
        linkDoCatalogo={linkDoCatalogo}
        rotuloDoCatalogo={rotuloDoCatalogo}
        preparar={prepararFechamento}
        tentativas={tentativas}
        aoVoltar={aoVoltar}
        aoFecharJanela={aoFecharJanela}
      />
    );
  }

  return (
    <GavetaCarrinho
      carrinho={carrinho}
      linkDaVitrine={linkDoCatalogo}
      rotuloDoCatalogo={rotuloDoCatalogo}
      aoFecharJanela={aoFecharJanela}
      aoFechar={() => {
        if (prepararFechamento) {
          aoMudarPasso("fechamento");
          return;
        }
        window.location.href = linkDoFechamento;
      }}
    />
  );
}

export function CarrinhoFlutuante({
  apelidoDaLoja,
  rotuloDoCatalogo,
  carregarProduto,
  prepararFechamento,
  abrirNoFechamento = false,
  abrirNoCarrinho = false,
}: CarrinhoFlutuanteProps) {
  const linkDoFechamento = `/loja/${apelidoDaLoja}/checkout`;
  const linkDoCatalogo = `/loja/${apelidoDaLoja}/cardapio`;

  const forma = useFormaDaSacola();
  // A região só se acha depois da montagem: no servidor ela não existe para a
  // ilha, e a primeira pintura no navegador é a mesma do servidor.
  const [regiao, setRegiao] = useState<HTMLElement | null>(null);
  const [resumo, setResumo] = useState<ResumoDaSacola>({
    contagem: 0,
    total: null,
  });
  const [aberto, setAberto] = useState(false);
  const [passo, setPasso] = useState<PassoDaJanela>("carrinho");
  const [anuncio, setAnuncio] = useState("");
  const [confirmacao, setConfirmacao] = useState<string | null>(null);
  const [tentativas] = useState(criarArquivoDeTentativas);

  const dialogo = useRef<HTMLDialogElement>(null);
  const botaoDaBarra = useRef<HTMLButtonElement>(null);
  const tituloDaColuna = useRef<HTMLHeadingElement>(null);

  // Sem a região do catálogo (loja sem catálogo), vale a barra em qualquer
  // largura: a sacola nunca fica sem lugar.
  const naColunaPossivel = forma === "coluna" && regiao !== null;
  const { contagem, total } = resumo;
  const naColuna = naColunaPossivel && contagem > 0;
  // Só carrega as linhas quando alguém as vê.
  const ativo = aberto || naColuna;

  // O que os ouvintes precisam saber, sem refazer o ouvinte a cada mudança.
  const vivo = useRef({ ativo, aberto, contagem, naColuna });
  useEffect(() => {
    vivo.current = { ativo, aberto, contagem, naColuna };
  });

  useEffect(() => {
    setRegiao(document.querySelector<HTMLElement>("[data-regiao-da-sacola]"));
  }, []);

  // --- o estado: uma fonte só ----------------------------------------------

  const carregarProdutoAtual = useRef(carregarProduto);
  useEffect(() => {
    carregarProdutoAtual.current = carregarProduto;
  });
  const temProduto = carregarProduto !== undefined;
  const [cache] = useState<CacheDeProdutos>(() => new Map());
  // Sinaliza o aviso que a própria sacola dispara ao mudar uma quantidade: ela
  // já recebe a lista nova na resposta, e ler de novo seria chamada em dobro.
  const avisoProprio = useRef(false);

  const servico = useMemo<ServicoDoCarrinho>(() => {
    const produto = temProduto
      ? (id: string) =>
          carregarProdutoAtual.current?.(id) ?? Promise.resolve(null)
      : undefined;
    return {
      ver: () => verPelaConferencia(apelidoDaLoja, produto, cache),
      async mudarQuantidade(itemId, quantidade) {
        const mudou = await mudarQuantidadeNoCarrinho(
          apelidoDaLoja,
          itemId,
          quantidade,
        );
        if (!mudou) throw new Error("a API recusou a mudança");
        avisoProprio.current = true;
        try {
          avisarQueOCarrinhoMudou();
        } finally {
          avisoProprio.current = false;
        }
        return verPelaConferencia(apelidoDaLoja, produto, cache);
      },
    };
  }, [apelidoDaLoja, temProduto, cache]);

  const carrinho = useCarrinho(servico, ativo);
  const recarregarLinhas = useRef(carrinho.recarregar);
  useEffect(() => {
    recarregarLinhas.current = carrinho.recarregar;
  });

  // Vira true quando o resumo veio do servidor (contagem 0 deixa de ser chute).
  const resumoLido = useRef(false);

  const atualizarResumo = useCallback(async () => {
    const lido = await lerResumoDaSacola(apelidoDaLoja, (contagem) =>
      // A contagem aparece na hora; o total chega com a conferência.
      setResumo((atual) =>
        atual.contagem === contagem
          ? atual
          : { contagem, total: contagem === 0 ? null : atual.total },
      ),
    );
    if (lido !== null) {
      resumoLido.current = true;
      setResumo(lido);
    }
  }, [apelidoDaLoja]);

  useEffect(() => {
    void atualizarResumo();
  }, [atualizarResumo]);

  // Quando as linhas chegam, a contagem e o total saem delas: sem outra chamada.
  const { carrinho: linhas, situacao } = carrinho;
  useEffect(() => {
    if (!vivo.current.ativo || linhas === null) return;
    if (situacao !== "pronto" && situacao !== "vazio") return;
    const total = linhas.totalDeItens > 0 ? linhas.total : null;
    setResumo((atual) =>
      atual.contagem === linhas.totalDeItens && atual.total === total
        ? atual
        : { contagem: linhas.totalDeItens, total },
    );
  }, [linhas, situacao]);

  // --- o aviso de que o carrinho mudou ---------------------------------------

  const anunciarDepois = useRef<ResumoDaSacola | null>(null);
  useEffect(() => {
    function aoMudar() {
      // A própria sacola mudou uma quantidade: a lista nova já veio.
      if (avisoProprio.current) return;
      if (!vivo.current.aberto) anunciarDepois.current = resumoAtual.current;
      if (vivo.current.ativo) void recarregarLinhas.current();
      else void atualizarResumo();
    }
    window.addEventListener(AVISO_DE_CARRINHO_MUDOU, aoMudar);
    return () => window.removeEventListener(AVISO_DE_CARRINHO_MUDOU, aoMudar);
  }, [atualizarResumo]);

  const resumoAtual = useRef(resumo);
  useEffect(() => {
    resumoAtual.current = resumo;
  });

  // Anuncia o que mudou, sem tirar o foco de onde a pessoa estava (AC-11006).
  // No celular e no tablet, a confirmação é visível (AvisoFlutuante) e se
  // anuncia sozinha; no computador, a coluna muda e um aviso só para leitor de
  // tela diz o que aconteceu.
  useEffect(() => {
    const antes = anunciarDepois.current;
    if (
      antes === null ||
      (antes.contagem === contagem && antes.total === total)
    ) {
      return;
    }
    anunciarDepois.current = null;
    const itens = `${contagem} ${contagem === 1 ? "item" : "itens"}`;
    if (contagem === 0) {
      setAnuncio("Sua sacola está vazia.");
    } else if (contagem > antes.contagem && !naColunaPossivel) {
      setConfirmacao(
        `Adicionado à sacola: ${itens}${total ? `, total ${total}` : ""}.`,
      );
    } else {
      setAnuncio(
        `${contagem > antes.contagem ? "Adicionado à sacola" : "Sacola atualizada"}: ${itens}${total ? `, total ${total}` : ""}.`,
      );
    }
  }, [contagem, total, naColunaPossivel]);

  // --- o diálogo -------------------------------------------------------------

  const abrirDialogo = useCallback(
    (inicio: PassoDaJanela) => {
      const janela = dialogo.current;
      // Navegador sem `<dialog>` vai para o fechamento, que é o mesmo destino
      // por outro caminho.
      if (janela === null || typeof janela.showModal !== "function") {
        if (inicio === "carrinho") window.location.href = linkDoFechamento;
        return;
      }
      if (janela.open) return;
      setPasso(inicio);
      setAberto(true);
      janela.showModal();
    },
    [linkDoFechamento],
  );

  /** Fecha o diálogo; o foco é resolvido em `aoFecharDialogo`. */
  const fecharDialogo = useCallback(() => {
    dialogo.current?.close();
  }, []);

  // Para onde o foco vai quando o diálogo fecha por um caminho que pede lugar
  // certo (o voltar do computador, a largura que alargou).
  const focoAoFechar = useRef<"titulo-da-coluna" | null>(null);

  function aoFecharDialogo() {
    setAberto(false);
    setPasso("carrinho");
    if (focoAoFechar.current === "titulo-da-coluna") {
      focoAoFechar.current = null;
      if (tituloDaColuna.current !== null) {
        tituloDaColuna.current.focus();
        return;
      }
    }
    // O navegador devolve o foco ao botão que abriu. Sem ele (abertura pela
    // rota, botão que sumiu porque a sacola esvaziou), o foco vai a um lugar
    // que existe, e nunca ao corpo da página.
    if (!focoPerdido()) return;
    const alvo =
      botaoDaBarra.current?.isConnected === true
        ? botaoDaBarra.current
        : ((vivo.current.naColuna ? tituloDaColuna.current : null) ??
          tituloDaPagina());
    alvo?.focus();
  }

  function irAoFechamento() {
    if (!prepararFechamento) {
      window.location.href = linkDoFechamento;
      return;
    }
    if (dialogo.current?.open) setPasso("fechamento");
    else abrirDialogo("fechamento");
  }

  /** "Voltar à sacola" do fechamento: na coluna, fecha o diálogo e volta a ela. */
  function voltarDoFechamento() {
    if (naColuna) {
      focoAoFechar.current = "titulo-da-coluna";
      fecharDialogo();
      return;
    }
    setPasso("carrinho");
    // O carrinho pode ter mudado lá (pedido feito, item esgotado).
    void carrinho.recarregar();
  }

  // --- pedidos de abrir ------------------------------------------------------

  /** O ícone da sacola do topo (card #105) pede para abrir a mesma sacola. */
  useEffect(() => {
    function aoPedir(evento: Event) {
      const pedido = (evento as CustomEvent<PedidoDeAbrirASacola | undefined>)
        .detail;
      // Quem atende marca: senão o topo navega para a página da sacola. O
      // destino NUNCA vem do evento, e o `detail` não decide nada além disso.
      // Sem `<dialog>` modal não há o que abrir: o topo navega para a página.
      const janela = dialogo.current;
      const naColunaAgora = vivo.current.naColuna;
      if (
        !naColunaAgora &&
        (janela === null || typeof janela.showModal !== "function")
      ) {
        return;
      }
      if (pedido !== undefined) pedido.atendido = true;

      // Com um diálogo aberto (o do produto, por exemplo) o topo está inerte, e
      // diálogo dentro de diálogo não existe: o pedido é ignorado.
      if (document.querySelector("dialog[open]") !== null) return;

      const atual = vivo.current;
      // Antes da primeira leitura a contagem é 0 sem ser verdade: abre o
      // diálogo, que carrega as linhas e mostra o estado real.
      if (!resumoLido.current) {
        abrirDialogo("carrinho");
        return;
      }
      if (atual.contagem === 0) {
        setAnuncio("Sua sacola está vazia.");
        return;
      }
      if (atual.naColuna) {
        tituloDaColuna.current?.focus();
        return;
      }
      abrirDialogo("carrinho");
    }
    window.addEventListener(EVENTO_ABRIR_SACOLA, aoPedir);
    return () => window.removeEventListener(EVENTO_ABRIR_SACOLA, aoPedir);
  }, [abrirDialogo]);

  // As rotas `/carrinho` e `/checkout` abrem a sacola e o fechamento.
  const rotaJaAberta = useRef(false);
  useEffect(() => {
    if (rotaJaAberta.current) return;
    if (abrirNoFechamento) {
      rotaJaAberta.current = true;
      abrirDialogo("fechamento");
    } else if (abrirNoCarrinho) {
      rotaJaAberta.current = true;
      abrirDialogo("carrinho");
    }
  }, [abrirNoFechamento, abrirNoCarrinho, abrirDialogo]);

  // --- a largura da janela muda (AC-11030) -----------------------------------

  // O diálogo da sacola que alarga fecha, e a coluna aparece com o foco no
  // título. O fechamento continua modal. A coluna que encolhe vira barra, e
  // nunca abre um diálogo sozinha.
  useEffect(() => {
    if (aberto && passo === "carrinho" && naColuna) {
      focoAoFechar.current = "titulo-da-coluna";
      fecharDialogo();
    }
  }, [aberto, passo, naColuna, fecharDialogo]);

  // O foco estava dentro da coluna quando ela virou barra: vai a "Ver sacola".
  const focoEstavaNaColuna = useRef(false);
  useEffect(() => {
    function aoFocar(evento: FocusEvent) {
      focoEstavaNaColuna.current =
        regiao !== null &&
        evento.target instanceof Node &&
        regiao.contains(evento.target);
    }
    document.addEventListener("focusin", aoFocar);
    return () => document.removeEventListener("focusin", aoFocar);
  }, [regiao]);

  useEffect(() => {
    if (naColuna) return;
    if (focoEstavaNaColuna.current && focoPerdido()) {
      botaoDaBarra.current?.focus();
    }
    focoEstavaNaColuna.current = false;
  }, [naColuna]);

  // --- o desenho -------------------------------------------------------------

  return (
    <>
      {!naColunaPossivel && contagem > 0 ? (
        <BarraDaSacola
          contagem={contagem}
          total={total}
          botaoRef={botaoDaBarra}
          aoAbrir={() => abrirDialogo("carrinho")}
        />
      ) : null}

      {naColuna && regiao !== null
        ? createPortal(
            <ColunaDaSacola
              carrinho={carrinho}
              tituloRef={tituloDaColuna}
              aoFechar={irAoFechamento}
            />,
            regiao,
          )
        : null}

      {/* Anúncio para leitor de tela, sem mover o foco. Sempre montado: uma
          região criada junto com o texto nem sempre é lida. */}
      <div className="sc-so-leitor" role="status" aria-live="polite">
        {anuncio}
      </div>

      <div className="sc-sacola-aviso">
        <AvisoFlutuante
          tom="sucesso"
          mensagem={confirmacao}
          acao={{
            rotulo: "Ver sacola",
            aoAcionar: () => {
              setConfirmacao(null);
              abrirDialogo("carrinho");
            },
          }}
          aoFechar={() => setConfirmacao(null)}
        />
      </div>

      <dialog
        ref={dialogo}
        className={`sc-flutuante__gaveta sc-carrinho-janela${
          passo === "fechamento" ? " sc-carrinho-janela--fechamento" : ""
        }`}
        aria-labelledby={
          passo === "fechamento"
            ? ID_DO_TITULO_DO_FECHAMENTO
            : ID_DO_TITULO_DO_CARRINHO
        }
        onClose={aoFecharDialogo}
        onClick={(evento) => {
          // Toque no fundo escurecido fecha a SACOLA: o alvo é o próprio
          // `<dialog>` só quando o toque caiu fora da caixa de conteúdo. No
          // fechamento, não: um toque fora sem querer apagaria o que a pessoa
          // escolheu — lá se sai pelo X, pelo Esc ou pelo voltar.
          if (evento.target === evento.currentTarget && passo === "carrinho") {
            fecharDialogo();
          }
        }}
      >
        {aberto ? (
          <ConteudoDoDialogo
            carrinho={carrinho}
            apelidoDaLoja={apelidoDaLoja}
            linkDoCatalogo={linkDoCatalogo}
            linkDoFechamento={linkDoFechamento}
            rotuloDoCatalogo={rotuloDoCatalogo}
            prepararFechamento={prepararFechamento}
            tentativas={tentativas}
            passo={passo}
            aoMudarPasso={setPasso}
            aoVoltar={voltarDoFechamento}
            aoFecharJanela={fecharDialogo}
          />
        ) : null}
      </dialog>
    </>
  );
}
