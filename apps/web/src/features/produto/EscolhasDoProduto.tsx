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
import { useMemo, useState } from "react";

import {
  ancoraDoGrupo,
  calcularItem,
  comoGrupoDaRegra,
  escreverDinheiro,
  opcoesComSaida,
  resolverVariacao,
  type EscolhaFeita,
  type GrupoNaTela,
  type ProdutoNaTela,
} from "../../lib/produto.ts";

import { BotaoAdicionar } from "./BotaoAdicionar.tsx";
import { MatrizDeVariacao } from "./MatrizDeVariacao.tsx";
import { SelecaoDeOpcoes } from "./SelecaoDeOpcoes.tsx";

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
  /**
   * Quem leva o item ao servidor. Chega por propriedade porque a tabela de
   * fronteiras não deixa um componente falar com a API — e porque é o que
   * permite provar este componente sem rede.
   */
  readonly aoAdicionar?: ((item: ItemEscolhido) => Promise<void>) | undefined;
}

export function EscolhasDoProduto({
  produto,
  aoAdicionar,
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
      const padrao = produto.variacoes.find((v) => v.padrao);
      if (padrao === undefined) return {};
      const inicial: Record<string, string> = {};
      for (const valor of padrao.valoresDosEixos) {
        inicial[valor.grupoId] = valor.opcaoId;
      }
      return inicial;
    },
  );

  const [variacaoManual, setVariacaoManual] = useState<string | null>(
    () => produto.variacoes.find((v) => v.padrao && v.disponivel)?.id ?? null,
  );

  const [quantidade, setQuantidade] = useState(1);
  const [observacao, setObservacao] = useState("");
  const [tentou, setTentou] = useState(false);
  const [enviando, setEnviando] = useState(false);

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
  const precoBase =
    produto.variacoes.length === 0
      ? (produto.precoCentavos ?? 0)
      : (variacao?.precoCentavos ?? 0);

  const conta = useMemo(
    () =>
      calcularItem({
        precoBaseEmCentavos: precoBase,
        quantidade,
        grupos: gruposComuns.map(comoGrupoDaRegra),
        escolhas,
      }),
    [precoBase, quantidade, gruposComuns, escolhas],
  );

  // Variante por escolher é pendência da PÁGINA, e não da regra do core: o core
  // não conhece variante, e não deveria — ele calcula o item a partir de um
  // preço base que quem chama já resolveu.
  const faltaVariacao = produto.variacoes.length > 0 && variacao === null;

  const pendenciasPorGrupo = useMemo(() => {
    if (!tentou) return {};
    const mapa: Record<string, string> = {};
    for (const pendencia of conta.pendencias) {
      mapa[pendencia.grupoId] ??= pendencia.explicacao;
    }
    return mapa;
  }, [tentou, conta.pendencias]);

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

    if (faltaVariacao) {
      const primeiroEixo = eixos[0];
      if (primeiroEixo !== undefined) irAtePendencia(primeiroEixo.id);
      return;
    }

    if (!conta.podeAdicionar) {
      const primeira = conta.pendencias[0];
      if (primeira !== undefined) irAtePendencia(primeira.grupoId);
      return;
    }

    if (aoAdicionar === undefined) return;

    setEnviando(true);
    try {
      await aoAdicionar({
        produtoId: produto.id,
        variacaoId: variacao?.id ?? null,
        quantidade,
        observacao: observacao.trim() === "" ? null : observacao.trim(),
        escolhas,
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="sc-produto__formulario">
      <MatrizDeVariacao
        variacoes={produto.variacoes}
        eixos={eixos}
        escolhaDeEixo={escolhaDeEixo}
        comSaida={comSaida}
        variacaoEscolhida={variacao?.id ?? null}
        aoEscolherEixo={escolherEixo}
        aoEscolherVariacao={setVariacaoManual}
      />

      {tentou && faltaVariacao ? (
        <p className="sc-produto__pendencia" role="alert">
          Escolha uma opção antes de adicionar.
        </p>
      ) : null}

      <SelecaoDeOpcoes
        grupos={gruposComuns}
        marcadas={marcadas}
        pendencias={pendenciasPorGrupo}
        aoAlternar={alternar}
      />

      {produto.aceitaObservacao ? (
        <p className="sc-produto__observacao">
          <label htmlFor="observacao">Alguma observação?</label>
          <textarea
            id="observacao"
            name="observacao"
            rows={2}
            maxLength={280}
            placeholder="Ex.: sem cebola, ponto da carne, troco para R$ 50"
            value={observacao}
            onChange={(evento) => setObservacao(evento.target.value)}
          />
        </p>
      ) : null}

      <BotaoAdicionar
        total={escreverDinheiro(conta.totalEmCentavos)}
        quantidade={quantidade}
        aVenda={produto.disponivel}
        explicacao={produto.explicacaoDaIndisponibilidade}
        enviando={enviando}
        aoMudarQuantidade={setQuantidade}
        aoAdicionar={() => void adicionar()}
      />
    </div>
  );
}
