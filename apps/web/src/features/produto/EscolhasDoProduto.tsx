"use client";
/**
 * O formulário do produto: variante, escolhas, quantidade e observação
 * (AC-411, AC-412).
 *
 * É O ÚNICO COMPONENTE DE NAVEGADOR desta página, e ele existe porque o AC-411
 * exige o total mudando NA HORA. Tudo em volta — imagens, descrição, preço de
 * abertura — é desenhado no servidor e continua legível sem script, que é o que
 * o AC-415 cobra da vitrine.
 *
 * O CÁLCULO NÃO MORA AQUI. `calcularItem` vem de `packages/core`, e é a MESMA
 * função que a API chama ao adicionar. Reescrever a conta neste arquivo daria
 * um total que bate hoje e diverge no dia em que uma das duas mudar — e o jeito
 * de descobrir seria um cliente reclamando do valor.
 *
 * AS PENDÊNCIAS SÓ APARECEM DEPOIS DE TENTAR. O AC-412 descreve o momento:
 * "quando tento adicionar sem escolher". Marcar de vermelho um formulário que a
 * pessoa acabou de abrir a acusa de um erro que ela ainda não teve chance de
 * cometer.
 */
import { useMemo, useState, type ReactNode } from "react";

import { unitarioNoAtacado } from "../../lib/atacado-na-vitrine.ts";
import {
  adicionarAoCarrinho,
  avisarQueOCarrinhoMudou,
} from "../../lib/carrinho-do-navegador.ts";
import {
  ancoraDoGrupo,
  calcularItem,
  comoGrupoDaRegra,
  conviteAEscolher,
  escreverDinheiro,
  opcoesComSaida,
  resolverVariacao,
  type EscolhaFeita,
  type GrupoNaTela,
  type ProdutoNaTela,
} from "../../lib/produto.ts";

import { BotaoAdicionar } from "./BotaoAdicionar.tsx";
import { exemploDaObservacao } from "./exemplo-da-observacao.ts";
import { secoesDeEscolha } from "./blocos-do-ramo.ts";
import {
  CHAVE_DA_LISTA_DE_VARIACOES,
  MatrizDeVariacao,
} from "./MatrizDeVariacao.tsx";
import { SelecaoDeOpcoes } from "./SelecaoDeOpcoes.tsx";
import { SeloDePreco } from "./SeloDePreco.tsx";
import { TabelaDoAtacado } from "./TabelaDoAtacado.tsx";

/** O que a página manda ao servidor quando a pessoa adiciona. */
export interface ItemEscolhido {
  readonly produtoId: string;
  readonly variacaoId: string | null;
  readonly quantidade: number;
  readonly observacao: string | null;
  readonly escolhas: readonly EscolhaFeita[];
}

export interface EscolhasDoProdutoProps {
  readonly produto: ProdutoNaTela;
  /** O apelido da loja, para a chamada saber a qual carrinho o item vai. */
  readonly apelidoDaLoja: string;
  /**
   * As palavras do RAMO.
   *
   * A lanchonete escolhe SABOR e a loja de roupas escolhe TAMANHO — é a mesma
   * variante no banco e duas palavras diferentes na boca de quem vende. A
   * escolha vem do ramo, e não de um `if` aqui dentro.
   */
  readonly rotulos: { readonly variacao: string };
  /** O tipo de negócio da loja: escolhe o exemplo da observação do item. */
  readonly ramo?: string | null | undefined;
  /** Os blocos do detalhe do ramo (`blocos.detalheProduto`): só ordenam as escolhas. */
  readonly blocos?: readonly string[] | undefined;
  /** Entre o preço e as escolhas: a descrição do produto. */
  readonly informacoes?: ReactNode;
  /**
   * Quem leva o item ao servidor.
   *
   * O PADRÃO é falar com a API do próprio navegador — é o único que carrega o
   * cookie da sessão do carrinho. A propriedade existe para a prova poder
   * responder sem rede: sem ela, a única prova possível seria "roda contra o
   * ambiente no ar", que falha por motivo errado e ninguém consegue rodar na
   * própria máquina.
   */
  readonly aoAdicionar?: ((item: ItemEscolhido) => Promise<void>) | undefined;
  /**
   * Chamado depois que o item entrou no carrinho. A janela do produto usa para
   * fechar e devolver a pessoa ao cardápio no lugar em que ela estava.
   */
  readonly aoAdicionado?: (() => void) | undefined;
}

export function EscolhasDoProduto({
  produto,
  apelidoDaLoja,
  rotulos,
  ramo,
  blocos,
  informacoes,
  aoAdicionar,
  aoAdicionado,
}: EscolhasDoProdutoProps) {
  const eixos = useMemo(
    () => produto.grupos.filter((grupo) => grupo.eixoDeVariacao),
    [produto.grupos],
  );
  const gruposComuns = useMemo(
    () => produto.grupos.filter((grupo) => !grupo.eixoDeVariacao),
    [produto.grupos],
  );

  // As opções marcadas por padrão já entram marcadas: o sabor mais pedido
  // aparece selecionado, e quem quer outro troca. Um clique a menos por pedido,
  // no fim do dia, é pedido a mais.
  const [marcadas, setMarcadas] = useState<Record<string, number>>(() => {
    const inicial: Record<string, number> = {};
    for (const grupo of produto.grupos) {
      if (grupo.eixoDeVariacao) continue;
      for (const opcao of grupo.opcoes) {
        if (opcao.marcadaPorPadrao && opcao.disponivel) inicial[opcao.id] = 1;
      }
    }
    return inicial;
  });

  const [escolhaDeEixo, setEscolhaDeEixo] = useState<Record<string, string>>(
    () => {
      // A variante padrão define os eixos de abertura: sem isso, a loja de
      // roupa abre sem tamanho marcado e o cliente decide antes de ver o preço.
      // Padrão esgotada NÃO abre marcada (AC-10921): a pessoa escolhe outra.
      const padrao = produto.variacoes.find((v) => v.padrao && v.disponivel);
      if (padrao === undefined) return {};
      const inicial: Record<string, string> = {};
      for (const valor of padrao.valoresDosEixos) {
        inicial[valor.grupoId] = valor.opcaoId;
      }
      return inicial;
    },
  );

  const [variacaoManual, setVariacaoManual] = useState<string | null>(
    () =>
      produto.variacoes.find((v) => v.padrao && v.disponivel)?.id ??
      // Uma variação só (a "Único" do cadastro): ela já é a escolha, e o
      // grupo nem aparece (MatrizDeVariacao).
      (produto.variacoes.length === 1 && produto.variacoes[0]?.disponivel
        ? produto.variacoes[0].id
        : null),
  );

  const [quantidade, setQuantidade] = useState(1);
  const [observacao, setObservacao] = useState("");
  const [tentou, setTentou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  /** O que dizer depois de tentar levar o item: sucesso ou o motivo da recusa. */
  const [recado, setRecado] = useState<string | null>(null);

  const variacao = useMemo(() => {
    if (produto.variacoes.length === 0) return null;
    if (eixos.length === 0) {
      return produto.variacoes.find((v) => v.id === variacaoManual) ?? null;
    }
    return resolverVariacao(produto.variacoes, eixos, escolhaDeEixo);
  }, [produto.variacoes, eixos, escolhaDeEixo, variacaoManual]);

  const comSaida = useMemo(() => {
    const mapa: Record<string, ReadonlySet<string>> = {};
    for (const eixo of eixos) {
      mapa[eixo.id] = opcoesComSaida(
        produto.variacoes,
        eixos,
        escolhaDeEixo,
        eixo.id,
      );
    }
    return mapa;
  }, [produto.variacoes, eixos, escolhaDeEixo]);

  const secoes = useMemo(
    () =>
      secoesDeEscolha(
        blocos,
        eixos,
        gruposComuns,
        eixos.length === 0 && produto.variacoes.length > 1,
      ),
    [blocos, eixos, gruposComuns, produto.variacoes.length],
  );
  // Os grupos comuns na ordem da TELA: é a ordem das pendências. Os eixos
  // nunca entram na conta: quem os resolve é a variação.
  const gruposNaOrdem = useMemo(
    () =>
      secoes.flatMap((secao) => (secao.tipo === "grupo" ? [secao.grupo] : [])),
    [secoes],
  );

  const escolhas: readonly EscolhaFeita[] = useMemo(
    () =>
      gruposComuns.flatMap((grupo) =>
        grupo.opcoes
          .filter((opcao) => (marcadas[opcao.id] ?? 0) > 0)
          .map((opcao) => ({
            grupoId: grupo.id,
            itemId: opcao.id,
            quantidade: marcadas[opcao.id] ?? 1,
          })),
      ),
    [gruposComuns, marcadas],
  );

  // O preço base é o da variante quando há uma escolhida, e o do produto quando
  // não há variante nenhuma. Produto com variantes e sem escolha fica sem base
  // — e o total mostra zero até a pessoa escolher, o que é honesto: não existe
  // "o preço" antes do tamanho.
  const varejo =
    produto.variacoes.length === 0
      ? (produto.precoCentavos ?? 0)
      : (variacao?.precoCentavos ?? 0);
  // O atacado (card #56) é sobre o preço da variante escolhida; antes da
  // escolha, a tabela mostra o da padrão, que é o preço que a página abriu.
  const atacado =
    produto.variacoes.length === 0
      ? produto.atacado
      : variacao === null
        ? null
        : variacao.atacado;
  // Levando o pedido mínimo, a base passa a ser o unitário da faixa — o mesmo
  // que o carrinho cobra; a API já fez a conta de cada faixa.
  const precoBase = unitarioNoAtacado(atacado, quantidade) ?? varejo;

  const conta = useMemo(
    () =>
      calcularItem({
        precoBaseEmCentavos: precoBase,
        quantidade,
        grupos: gruposNaOrdem.map(comoGrupoDaRegra),
        escolhas,
      }),
    [precoBase, quantidade, gruposNaOrdem, escolhas],
  );

  // Variante por escolher é pendência da PÁGINA, e não da regra do core: o core
  // não conhece variante, e não deveria — ele calcula o item a partir de um
  // preço base que quem chama já resolveu.
  const faltaVariacao = produto.variacoes.length > 0 && variacao === null;

  /**
   * Tudo o que falta, NA ORDEM DA TELA: eixo sem escolha, lista de variações
   * sem escolha e grupo comum com pendência. A rolagem vai à primeira (AC-10909).
   */
  const pendenciasNaOrdem = useMemo(() => {
    const lista: { chave: string; texto: string }[] = [];
    for (const secao of secoes) {
      if (secao.tipo === "eixo") {
        if (escolhaDeEixo[secao.grupo.id] === undefined) {
          lista.push({
            chave: secao.grupo.id,
            texto: `Escolha ${secao.grupo.nome.toLowerCase()} antes de adicionar.`,
          });
        }
      } else if (secao.tipo === "lista") {
        if (variacao === null) {
          lista.push({
            chave: CHAVE_DA_LISTA_DE_VARIACOES,
            texto: `Escolha ${rotulos.variacao.toLowerCase()} antes de adicionar.`,
          });
        }
      } else {
        const pendencia = conta.pendencias.find(
          (p) => p.grupoId === secao.grupo.id,
        );
        if (pendencia !== undefined) {
          lista.push({ chave: secao.grupo.id, texto: pendencia.explicacao });
        }
      }
    }
    return lista;
  }, [secoes, escolhaDeEixo, variacao, rotulos.variacao, conta.pendencias]);

  const pendenciasPorGrupo = useMemo(() => {
    if (!tentou) return {};
    const mapa: Record<string, string> = {};
    for (const pendencia of pendenciasNaOrdem) {
      mapa[pendencia.chave] ??= pendencia.texto;
    }
    return mapa;
  }, [tentou, pendenciasNaOrdem]);

  // A variação escolhida acabou, ou a padrão (que abriria marcada) acabou e
  // ainda não há outra escolhida, com o produto à venda (AC-10921). Com o
  // produto inteiro fora de venda vale a frase do produto, e não esta.
  const padraoEsgotada =
    produto.variacoes.length > 1 &&
    produto.variacoes.some((v) => v.padrao && !v.disponivel);
  const bloqueio =
    produto.disponivel &&
    ((variacao !== null && !variacao.disponivel) ||
      (variacao === null && padraoEsgotada))
      ? "Essa opção acabou. Escolha outra."
      : null;

  function alternar(grupo: GrupoNaTela, opcaoId: string) {
    setMarcadas((atual) => {
      const proximo = { ...atual };
      const escolhaUnica = grupo.maximo === 1;

      if (escolhaUnica) {
        // Rádio: marcar uma limpa as irmãs do mesmo grupo.
        for (const opcao of grupo.opcoes) delete proximo[opcao.id];
        proximo[opcaoId] = 1;
        return proximo;
      }

      const quantas = proximo[opcaoId] ?? 0;
      const escolhidasNoGrupo = grupo.opcoes.reduce(
        (soma, opcao) => soma + (proximo[opcao.id] ?? 0),
        0,
      );
      // O controle desabilita a quarta opção, mas a regra também vive aqui:
      // uma mudança disparada fora do navegador não pode furar o máximo.
      if (
        quantas === 0 &&
        grupo.maximo !== null &&
        escolhidasNoGrupo >= grupo.maximo
      ) {
        return atual;
      }
      if (quantas > 0) delete proximo[opcaoId];
      else proximo[opcaoId] = 1;
      return proximo;
    });
  }

  function escolherEixo(grupoId: string, opcaoId: string) {
    setEscolhaDeEixo((atual) => ({ ...atual, [grupoId]: opcaoId }));
  }

  /**
   * Leva a pessoa até o primeiro grupo pendente e dá foco a ele (AC-412).
   *
   * A ROLAGEM RESPEITA QUEM PEDIU MENOS MOVIMENTO: com `prefers-reduced-motion`
   * a página SALTA para o grupo em vez de deslizar. O que não muda é o destino
   * — quem pediu menos movimento continua sendo levado até lá.
   */
  function irAtePendencia(grupoId: string) {
    const alvo = document.getElementById(ancoraDoGrupo(grupoId));
    if (alvo === null) return;

    const querParado =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    alvo.scrollIntoView({
      behavior: querParado ? "auto" : "smooth",
      block: "center",
    });
    // O foco é o que leva junto quem ouve a página: sem ele, a rolagem move os
    // olhos e o leitor de tela continua lendo o botão lá embaixo.
    alvo.focus({ preventScroll: true });
  }

  async function adicionar() {
    setTentou(true);

    if (bloqueio !== null) return;

    // O que falta (variação ou grupo) vale mais que o botão: vai ao primeiro
    // pendente na ordem em que a tela o mostra.
    const primeira = pendenciasNaOrdem[0];
    if (primeira !== undefined) {
      irAtePendencia(primeira.chave);
      return;
    }
    if (faltaVariacao || !conta.podeAdicionar) return;

    const item: ItemEscolhido = {
      produtoId: produto.id,
      variacaoId: variacao?.id ?? null,
      quantidade,
      observacao: observacao.trim() === "" ? null : observacao.trim(),
      escolhas,
    };

    setEnviando(true);
    setRecado(null);
    try {
      if (aoAdicionar !== undefined) {
        await aoAdicionar(item);
        return;
      }

      const resultado = await adicionarAoCarrinho(apelidoDaLoja, {
        produtoId: item.produtoId,
        variacaoId: item.variacaoId,
        quantidade: item.quantidade,
        observacao: item.observacao,
        // `itemId` vira `opcaoId`: a regra do core chama de item o que o
        // contrato chama de opção. A tradução é aqui, na borda entre os dois.
        escolhas: item.escolhas.map((escolha) => ({
          grupoId: escolha.grupoId,
          opcaoId: escolha.itemId,
          quantidade: escolha.quantidade,
        })),
        // O total vai junto SÓ para a API anotar divergência. Ela recalcula com
        // os preços dela, e é o número dela que vale (P-006).
        totalVistoCentavos: conta.totalEmCentavos,
      });

      if (resultado.estado === "adicionado") {
        avisarQueOCarrinhoMudou();
        aoAdicionado?.();
        return;
      }

      // Recusa do servidor NÃO é a mesma coisa que falha de rede, e a pessoa
      // precisa saber qual das duas foi: uma pede recarregar a página, a outra
      // pede tentar de novo.
      setRecado(
        resultado.estado === "nao-fecha"
          ? "O cardápio mudou enquanto você escolhia. Recarregue a página para ver as opções de agora."
          : "Não foi possível adicionar agora. Tente de novo em instantes.",
      );
    } finally {
      setEnviando(false);
    }
  }

  // O preço do cabeçalho, em três casos (D-3): sem variações, o do produto;
  // com a variação resolvida, o dela; pendente, o convite — nunca um valor que
  // muda sozinho. Uma variação só vale por ela mesma.
  const unica =
    produto.variacoes.length === 1 ? (produto.variacoes[0] ?? null) : null;
  const dela = variacao ?? unica;
  const cabecalho =
    produto.variacoes.length === 0
      ? { preco: produto.preco, anterior: produto.precoAnterior }
      : dela !== null
        ? { preco: dela.preco, anterior: dela.precoAnterior ?? null }
        : { preco: null, anterior: null };
  const convite = conviteAEscolher(rotulos.variacao, {
    soFaltaVariacao: conta.podeAdicionar,
  });

  const subtotal =
    variacao !== null || produto.variacoes.length === 0
      ? {
          quantidade,
          unitario: escreverDinheiro(conta.unitarioEmCentavos),
          total: escreverDinheiro(conta.totalEmCentavos),
        }
      : null;

  const eixoNoEstado = {
    rotuloDaVariacao: rotulos.variacao,
    variacoes: produto.variacoes,
    escolhaDeEixo,
    comSaida,
    variacaoEscolhida: variacao?.id ?? null,
    aoEscolherEixo: escolherEixo,
    aoEscolherVariacao: setVariacaoManual,
    pendencias: pendenciasPorGrupo,
  } as const;

  return (
    <div className="sc-produto__formulario">
      <SeloDePreco
        preco={cabecalho.preco}
        precoAnterior={cabecalho.anterior}
        convite={convite}
      />

      {informacoes}

      {secoes.map((secao) =>
        secao.tipo === "grupo" ? (
          <SelecaoDeOpcoes
            key={secao.chave}
            grupos={[secao.grupo]}
            marcadas={marcadas}
            pendencias={pendenciasPorGrupo}
            aoAlternar={alternar}
          />
        ) : (
          <MatrizDeVariacao
            key={secao.chave}
            {...eixoNoEstado}
            eixos={secao.tipo === "eixo" ? [secao.grupo] : []}
          />
        ),
      )}

      <TabelaDoAtacado
        atacado={variacao === null ? produto.atacado : atacado}
        varejoCentavos={variacao === null ? produto.precoCentavos : varejo}
        quantidade={quantidade}
      />

      {produto.aceitaObservacao ? (
        <p className="sc-produto__observacao">
          <label htmlFor="observacao">
            Observação para este item (opcional)
          </label>
          <textarea
            id="observacao"
            name="observacao"
            rows={2}
            maxLength={280}
            placeholder={exemploDaObservacao(ramo)}
            aria-describedby="observacao-dica"
            value={observacao}
            onChange={(evento) => setObservacao(evento.target.value)}
          />
          <span className="sc-campo__dica" id="observacao-dica">
            Até 280 letras. O troco se informa ao finalizar o pedido.
          </span>
        </p>
      ) : null}

      {recado === null ? null : (
        <p className="sc-produto__recado" role="status">
          {recado}
        </p>
      )}

      <BotaoAdicionar
        total={escreverDinheiro(conta.totalEmCentavos)}
        quantidade={quantidade}
        aVenda={produto.disponivel}
        explicacao={produto.explicacaoDaIndisponibilidade}
        enviando={enviando}
        subtotal={subtotal}
        bloqueio={bloqueio}
        aoMudarQuantidade={setQuantidade}
        aoAdicionar={() => void adicionar()}
      />
    </div>
  );
}
