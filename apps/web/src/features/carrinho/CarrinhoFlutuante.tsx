"use client";

/**
 * O carrinho flutuante da vitrine.
 *
 * UMA SACOLA QUE SÓ APARECE QUANDO HÁ O QUE MOSTRAR. Carrinho vazio flutuando
 * sobre o cardápio é ruído; com um item dentro, ele vira o próximo passo — um
 * botão redondo com a contagem e o total, que a pessoa arrasta para onde não
 * atrapalha (`SacolaFlutuante`).
 *
 * O TOQUE ABRE UMA JANELA, e não outra página. A pessoa confere, ajusta a
 * quantidade e volta ao cardápio sem perder o lugar da rolagem. A gaveta é um
 * `<dialog>` de verdade: prende o foco, fecha com Esc e devolve o foco ao botão
 * — três coisas que uma `div` posicionada teria de reinventar.
 *
 * O FECHAMENTO É O SEGUNDO PASSO DA MESMA JANELA. "Fechar pedido" troca o
 * conteúdo do carrinho pelo do fechamento (`PassoDoFechamento`), com o voltar
 * ao carrinho; nada de navegar. `/loja/<loja>/checkout` abre a janela já nele.
 *
 * SEM SCRIPT, NADA DISTO APARECE, e a página não perde nada: a barra do topo
 * continua com o link do carrinho, que leva ao fechamento.
 *
 * O TOTAL VEM DA CONFERÊNCIA DA API, e não de uma conta feita aqui. O carrinho
 * guarda só identificadores; nome e preço de agora são da API (P-006).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AVISO_DE_CARRINHO_MUDOU,
  avisarQueOCarrinhoMudou,
  conferirCarrinho,
  contarItensDoCarrinho,
  mudarQuantidadeNoCarrinho,
  verItensDoCarrinho,
} from "../../lib/carrinho-do-navegador.ts";
import { escreverDinheiro, type ProdutoNaTela } from "../../lib/produto.ts";
import { ID_DO_TITULO_DO_FECHAMENTO } from "../checkout/FechamentoDaCompra.tsx";
import { PassoDoFechamento } from "../checkout/PassoDoFechamento.tsx";
import type { PrepararFechamento } from "../checkout/preparo-do-fechamento.ts";

import { avisoDoAtacado, faixaQueValeu } from "./atacado-na-linha.ts";
import { GavetaCarrinho, ID_DO_TITULO_DO_CARRINHO } from "./GavetaCarrinho.tsx";
import { SacolaFlutuante } from "./SacolaFlutuante.tsx";
import {
  useCarrinho,
  type CarrinhoNaTela,
  type ItemNaTela,
  type ServicoDoCarrinho,
} from "./useCarrinho.ts";

/** Busca o produto no servidor (variação, opções com preço, descrição). */
export type CarregarProduto = (id: string) => Promise<ProdutoNaTela | null>;

export interface CarrinhoFlutuanteProps {
  readonly apelidoDaLoja: string;
  /** Como a loja chama o catálogo: "Cardápio", "Catálogo". */
  readonly rotuloDoCatalogo: string;
  /**
   * Na página do produto a barra de adicionar já ocupa o pé da tela no
   * celular, e a sacola não desce até ela.
   */
  readonly acimaDaAcao?: boolean | undefined;
  /**
   * Quem traz o detalhe do produto (a mesma ação de servidor da janela do
   * produto). Opcional: sem ela, cada item mostra o que o carrinho guarda —
   * opções e observação —, só sem o preço das opções e sem a descrição.
   */
  readonly carregarProduto?: CarregarProduto | undefined;
  /**
   * Quem prepara o fechamento (configuração da loja e conta logada), já preso
   * ao apelido. Sem ela, "Fechar pedido" vai ao endereço do checkout.
   */
  readonly prepararFechamento?: PrepararFechamento | undefined;
  /** Abre a janela já no fechamento — a rota `/loja/<loja>/checkout`. */
  readonly abrirNoFechamento?: boolean | undefined;
  /** Abre a janela no carrinho — a rota `/loja/<loja>/carrinho`. */
  readonly abrirNoCarrinho?: boolean | undefined;
}

/** Os dois passos da janela. */
type PassoDaJanela = "carrinho" | "fechamento";

/** A descrição curta: a chamada, ou a descrição do produto. */
function descricaoCurta(produto: ProdutoNaTela | undefined): string | null {
  return produto?.chamada ?? produto?.descricao ?? null;
}

/**
 * Lê o carrinho pela conferência, que é quem sabe nome e preço de agora, e
 * junta o que a tela mostra de cada item.
 *
 * TRÊS FONTES, CADA UMA COM O QUE SÓ ELA SABE: a conferência dá nome, preço
 * unitário, subtotal da linha e o total (P-006); o carrinho da sessão dá a
 * variação, as opções e a observação; o produto dá o NOME da variação, o
 * acréscimo de cada opção e a descrição. Nenhuma conta é feita aqui — os preços
 * vêm todos escritos. Se o carrinho ou o produto não responderem, o item
 * aparece com o que se tem, e o total continua o da conferência.
 */
async function verPelaConferencia(
  apelidoDaLoja: string,
  carregarProduto?: CarregarProduto,
): Promise<CarrinhoNaTela> {
  const [resultado, guardados] = await Promise.all([
    conferirCarrinho(apelidoDaLoja),
    verItensDoCarrinho(apelidoDaLoja),
  ]);
  if (resultado.estado !== "conferido") throw new Error(resultado.motivo);

  const { itens, subtotalCentavos } = resultado.conferencia;
  const doCarrinho = new Map((guardados ?? []).map((item) => [item.id, item]));

  const produtos = new Map<string, ProdutoNaTela>();
  if (carregarProduto) {
    const ids = [...new Set(itens.map((item) => item.produtoId))];
    const achados = await Promise.all(
      ids.map((id) => carregarProduto(id).catch(() => null)),
    );
    ids.forEach((id, indice) => {
      const achado = achados[indice];
      if (achado) produtos.set(id, achado);
    });
  }

  return {
    itens: itens.map((item): ItemNaTela => {
      const guardado = doCarrinho.get(item.itemId);
      const produto = produtos.get(item.produtoId);
      // A variação só vale ser dita quando o produto tem mais de uma: "Padrão"
      // ao lado do refrigerante é ruído.
      const variacao =
        produto && produto.variacoes.length > 1 && guardado?.variacaoId
          ? (produto.variacoes.find((v) => v.id === guardado.variacaoId)
              ?.nome ?? null)
          : null;
      return {
        id: item.itemId,
        nome: item.nome,
        variacao,
        quantidade: item.quantidade,
        precoUnitario: escreverDinheiro(item.precoUnitarioCentavos),
        totalDaLinha: escreverDinheiro(item.totalDaLinhaCentavos),
        // O atacado, como a conferência calculou (card #57): o varejo riscado,
        // a faixa que valeu e quantas peças faltam para a próxima.
        precoDeVarejo:
          item.varejoUnitarioCentavos === undefined ||
          item.varejoUnitarioCentavos === null
            ? null
            : escreverDinheiro(item.varejoUnitarioCentavos),
        avisoDoAtacado: avisoDoAtacado(item.atacado ?? null),
        faixaDoAtacado: faixaQueValeu(item.atacado ?? null),
        observacao: guardado?.observacao ?? null,
        descricao: descricaoCurta(produto),
        opcoes: (guardado?.opcoes ?? []).map((opcao) => {
          const grupo = produto?.grupos.find((g) => g.nome === opcao.grupoNome);
          const daLoja = grupo?.opcoes.find((o) => o.nome === opcao.opcaoNome);
          return {
            grupoNome: opcao.grupoNome,
            opcaoNome: opcao.opcaoNome,
            quantidade: opcao.quantidade,
            acrescimo: daLoja?.acrescimo ?? null,
          };
        }),
      };
    }),
    totalDeItens: itens.reduce((soma, item) => soma + item.quantidade, 0),
    total: escreverDinheiro(subtotalCentavos),
  };
}

/** O conteúdo da janela. Só existe enquanto ela está aberta. */
function ConteudoDaGaveta({
  apelidoDaLoja,
  linkDoCatalogo,
  linkDoFechamento,
  rotuloDoCatalogo,
  carregarProduto,
  prepararFechamento,
  passo,
  aoMudarPasso,
  aoFecharJanela,
}: {
  readonly apelidoDaLoja: string;
  readonly linkDoCatalogo: string;
  readonly linkDoFechamento: string;
  readonly rotuloDoCatalogo: string;
  readonly carregarProduto?: CarregarProduto | undefined;
  readonly prepararFechamento?: PrepararFechamento | undefined;
  readonly passo: PassoDaJanela;
  readonly aoMudarPasso: (passo: PassoDaJanela) => void;
  readonly aoFecharJanela: () => void;
}) {
  const servico = useMemo<ServicoDoCarrinho>(
    () => ({
      ver: () => verPelaConferencia(apelidoDaLoja, carregarProduto),
      async mudarQuantidade(itemId, quantidade) {
        const mudou = await mudarQuantidadeNoCarrinho(
          apelidoDaLoja,
          itemId,
          quantidade,
        );
        if (!mudou) throw new Error("a API recusou a mudança");
        avisarQueOCarrinhoMudou();
        return verPelaConferencia(apelidoDaLoja, carregarProduto);
      },
    }),
    [apelidoDaLoja, carregarProduto],
  );
  const carrinho = useCarrinho(servico);

  if (passo === "fechamento" && prepararFechamento) {
    return (
      <PassoDoFechamento
        apelidoDaLoja={apelidoDaLoja}
        linkDoCatalogo={linkDoCatalogo}
        rotuloDoCatalogo={rotuloDoCatalogo}
        preparar={prepararFechamento}
        aoVoltar={() => {
          aoMudarPasso("carrinho");
          // O carrinho pode ter mudado lá (pedido feito, item esgotado).
          void carrinho.recarregar();
        }}
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
  acimaDaAcao = false,
  carregarProduto,
  prepararFechamento,
  abrirNoFechamento = false,
  abrirNoCarrinho = false,
}: CarrinhoFlutuanteProps) {
  const [contagem, setContagem] = useState(0);
  const [total, setTotal] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [passo, setPasso] = useState<PassoDaJanela>("carrinho");
  const [pulso, setPulso] = useState(0);
  const gaveta = useRef<HTMLDialogElement>(null);

  const linkDoFechamento = `/loja/${apelidoDaLoja}/checkout`;
  const linkDoCatalogo = `/loja/${apelidoDaLoja}/cardapio`;

  const atualizar = useCallback(async () => {
    const quantos = await contarItensDoCarrinho(apelidoDaLoja);
    if (quantos === null) return;
    setContagem(quantos);
    if (quantos === 0) {
      setTotal(null);
      return;
    }
    const conferencia = await conferirCarrinho(apelidoDaLoja);
    setTotal(
      conferencia.estado === "conferido"
        ? escreverDinheiro(conferencia.conferencia.subtotalCentavos)
        : null,
    );
  }, [apelidoDaLoja]);

  useEffect(() => {
    void atualizar();

    function aoMudar() {
      void atualizar();
      // A chave muda e o CSS refaz o pulo do selo: o olho percebe que o item
      // entrou sem a página precisar dizer em voz alta.
      setPulso((anterior) => anterior + 1);
    }
    window.addEventListener(AVISO_DE_CARRINHO_MUDOU, aoMudar);
    return () => window.removeEventListener(AVISO_DE_CARRINHO_MUDOU, aoMudar);
  }, [atualizar]);

  const abrir = useCallback(
    (inicio: PassoDaJanela = "carrinho") => {
      const dialogo = gaveta.current;
      // Navegador sem `<dialog>` vai para o fechamento, que é o mesmo destino
      // por outro caminho.
      if (dialogo === null || typeof dialogo.showModal !== "function") {
        if (inicio === "carrinho") window.location.href = linkDoFechamento;
        return;
      }
      if (dialogo.open) return;
      setPasso(inicio);
      setAberto(true);
      dialogo.showModal();
    },
    [linkDoFechamento],
  );

  // A rota do checkout abre a janela já no fechamento, por cima do cardápio.
  useEffect(() => {
    if (abrirNoFechamento) abrir("fechamento");
    else if (abrirNoCarrinho) abrir("carrinho");
  }, [abrirNoFechamento, abrirNoCarrinho, abrir]);

  function fechar() {
    gaveta.current?.close();
  }

  return (
    <>
      {contagem > 0 ? (
        <SacolaFlutuante
          contagem={contagem}
          total={total}
          pulso={pulso}
          acimaDaAcao={acimaDaAcao}
          aoAbrir={() => abrir()}
        />
      ) : null}

      <dialog
        ref={gaveta}
        className={`sc-flutuante__gaveta sc-carrinho-janela${
          passo === "fechamento" ? " sc-carrinho-janela--fechamento" : ""
        }`}
        aria-labelledby={
          passo === "fechamento"
            ? ID_DO_TITULO_DO_FECHAMENTO
            : ID_DO_TITULO_DO_CARRINHO
        }
        onClose={() => {
          setAberto(false);
          setPasso("carrinho");
        }}
        onClick={(evento) => {
          // Toque no fundo escurecido fecha o CARRINHO: o alvo é o próprio
          // `<dialog>` só quando o toque caiu fora da caixa de conteúdo. No
          // fechamento, não: um toque fora sem querer apagaria o que a pessoa
          // escolheu — lá se sai pelo X, pelo Esc ou pelo voltar.
          if (evento.target === evento.currentTarget && passo === "carrinho") {
            fechar();
          }
        }}
      >
        {aberto ? (
          <ConteudoDaGaveta
            apelidoDaLoja={apelidoDaLoja}
            linkDoCatalogo={linkDoCatalogo}
            linkDoFechamento={linkDoFechamento}
            rotuloDoCatalogo={rotuloDoCatalogo}
            carregarProduto={carregarProduto}
            prepararFechamento={prepararFechamento}
            passo={passo}
            aoMudarPasso={setPasso}
            aoFecharJanela={fechar}
          />
        ) : null}
      </dialog>
    </>
  );
}
