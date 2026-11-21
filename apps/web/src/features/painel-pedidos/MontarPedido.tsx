"use client";

/**
 * O dono monta o pedido que recebeu por telefone (AC-707, AC-708, AC-709,
 * AC-712).
 *
 * FEITA PARA UMA MÃO NO CELULAR (ASM-702): uma coluna, alvos grandes, e a
 * ordem do atendimento — quem pede, o que pede, como recebe, confirmar. Nada
 * de tabela larga nem de menu escondido.
 *
 * A REGRA DO ITEM É A MESMA DA VITRINE. O total de cada item e o que falta
 * escolher vêm de `calcularItem`, a mesma função da página do produto e da API
 * (P-006). É o que faz o grupo obrigatório impedir o "Adicionar" aqui do mesmo
 * jeito que impede o cliente (AC-708) — e o servidor confere de novo ao
 * confirmar, com o catálogo de agora.
 *
 * O PREÇO QUE A TELA MOSTRA É ESTIMATIVA: o total que vale é o que a loja
 * calcula ao confirmar, e é esse que volta na resposta.
 *
 * REPETIR UM PEDIDO (AC-712) abre esta mesma tela já preenchida com os itens
 * do pedido antigo e os preços de hoje. O que saiu do catálogo aparece à parte;
 * o item cuja escolha sumiu fica fora, com o motivo, para o dono escolher de
 * novo com o cliente ao telefone.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Aviso,
  Botao,
  Campo,
  Info,
  Seletor,
  Sucesso,
  descritoresDoCampo,
} from "@simpleclick/ui";

import { centavosDoTexto } from "../../lib/dinheiro.ts";

import {
  buscarFicha,
  cadastrarCliente,
  lancarPedidoManual,
  pedirRepeticao,
  type Buscar,
  type ClienteDaLista,
  type PedidoManualCriado,
  type PedidoManualParaCriar,
  type RepeticaoDoPedido,
  type ResultadoDoLancamento,
} from "../../lib/clientes-do-painel.ts";
import {
  calcularItem,
  comoGrupoDaRegra,
  escreverDinheiro,
  type GrupoNaTela,
  type VariacaoNaTela,
} from "../../lib/produto.ts";
import { EscolherCliente } from "./EscolherCliente.tsx";
import { codigoDoPedido } from "@simpleclick/contracts";

/** O produto como a montagem precisa dele: o da página do produto. */
export interface ProdutoParaMontar {
  readonly id: string;
  readonly nome: string;
  readonly precoCentavos: number | null;
  readonly imagem?: string | null | undefined;
  readonly disponivel: boolean;
  readonly grupos: readonly GrupoNaTela[];
  readonly variacoes: readonly VariacaoNaTela[];
}

interface EscolhaMarcada {
  readonly grupoId: string;
  readonly opcaoId: string;
  readonly quantidade: number;
}

/** Um item já no pedido. */
interface ItemMontado {
  readonly chave: string;
  readonly produtoId: string;
  readonly variacaoId: string | null;
  readonly quantidade: number;
  readonly escolhas: readonly EscolhaMarcada[];
  readonly descricao: string;
  readonly totalCentavos: number;
  /** "Custava R$ 20,00" quando veio de um pedido repetido e o preço mudou. */
  readonly antes: string | null;
}

export interface MontarPedidoProps {
  readonly produtos: readonly ProdutoParaMontar[];
  /** A ficha de quem pede, quando o pedido nasce da ficha do cliente. */
  readonly clienteId?: string | null | undefined;
  /** O pedido antigo a repetir (AC-712). */
  readonly repetirPedidoId?: string | null | undefined;
  /** A rede. A prova troca por uma que responde sem servidor. */
  readonly buscar?: Buscar | undefined;
  /** Lê grupos e variações só depois de selecionar um produto no balcão. */
  readonly carregarDetalhe?:
    | ((produtoId: string) => Promise<ProdutoParaMontar | null>)
    | undefined;
  /** Quem lança. Padrão: a rota do painel. */
  readonly lancar?:
    | ((pedido: PedidoManualParaCriar) => Promise<ResultadoDoLancamento>)
    | undefined;
}

const FORMAS_DE_PAGAMENTO = [
  ["PIX", "Pix"],
  ["CASH", "Dinheiro"],
  ["CARD_ON_DELIVERY", "Cartão na entrega"],
  ["OTHER", "A combinar com o cliente"],
] as const;

/** Observação do pedido: o mesmo limite do contrato. */
const MAXIMO_DA_OBSERVACAO = 500;

type FormaDePagamento = (typeof FORMAS_DE_PAGAMENTO)[number][0];

let proximaChave = 0;
function novaChave(): string {
  proximaChave += 1;
  return `item-${proximaChave}`;
}

/** Os grupos que entram na conta das escolhas: os eixos são a variação. */
function gruposComuns(produto: ProdutoParaMontar): readonly GrupoNaTela[] {
  return produto.grupos.filter((grupo) => !grupo.eixoDeVariacao);
}

function precoBase(
  produto: ProdutoParaMontar,
  variacaoId: string | null,
): number | null {
  if (produto.variacoes.length === 0) return produto.precoCentavos;
  return (
    produto.variacoes.find((v) => v.id === variacaoId)?.precoCentavos ?? null
  );
}

/** A conta do item pela regra única do núcleo. */
function contaDoItem(
  produto: ProdutoParaMontar,
  variacaoId: string | null,
  quantidade: number,
  escolhas: readonly EscolhaMarcada[],
) {
  return calcularItem({
    precoBaseEmCentavos: precoBase(produto, variacaoId) ?? 0,
    quantidade,
    grupos: gruposComuns(produto).map(comoGrupoDaRegra),
    escolhas: escolhas.map((escolha) => ({
      grupoId: escolha.grupoId,
      itemId: escolha.opcaoId,
      quantidade: escolha.quantidade,
    })),
  });
}

function descreverItem(
  produto: ProdutoParaMontar,
  variacaoId: string | null,
  escolhas: readonly EscolhaMarcada[],
): string {
  const variacao = produto.variacoes.find((v) => v.id === variacaoId);
  const nomes = escolhas.flatMap((escolha) => {
    const opcao = produto.grupos
      .find((g) => g.id === escolha.grupoId)
      ?.opcoes.find((o) => o.id === escolha.opcaoId);
    return opcao ? [opcao.nome] : [];
  });
  return [
    produto.nome + (variacao ? ` (${variacao.nome})` : ""),
    ...(nomes.length > 0 ? [nomes.join(", ")] : []),
  ].join(" — ");
}

/** O seletor de um produto: variação, escolhas e quantidade. */
function ItemEmMontagem({
  produto,
  aoAdicionar,
  aoCancelar,
}: {
  readonly produto: ProdutoParaMontar;
  readonly aoAdicionar: (item: ItemMontado) => void;
  readonly aoCancelar: () => void;
}) {
  const padrao =
    produto.variacoes.find((v) => v.padrao && v.disponivel) ??
    produto.variacoes.find((v) => v.disponivel) ??
    null;
  const [variacaoId, setVariacaoId] = useState<string | null>(
    padrao?.id ?? null,
  );
  const [quantidade, setQuantidade] = useState(1);
  const [escolhas, setEscolhas] = useState<readonly EscolhaMarcada[]>([]);
  const [tentou, setTentou] = useState(false);

  const conta = contaDoItem(produto, variacaoId, quantidade, escolhas);
  const semPreco = precoBase(produto, variacaoId) === null;

  function alternar(grupo: GrupoNaTela, opcaoId: string) {
    setEscolhas((atuais) => {
      const doGrupo = atuais.filter((e) => e.grupoId === grupo.id);
      const marcada = doGrupo.some((e) => e.opcaoId === opcaoId);
      const outras = atuais.filter((e) => e.grupoId !== grupo.id);
      if (marcada) {
        return [...outras, ...doGrupo.filter((e) => e.opcaoId !== opcaoId)];
      }
      // Grupo de UMA escolha troca a marcada; os outros acumulam.
      const base = grupo.maximo === 1 ? [] : doGrupo;
      return [
        ...outras,
        ...base,
        { grupoId: grupo.id, opcaoId, quantidade: 1 },
      ];
    });
  }

  function adicionar() {
    setTentou(true);
    if (!conta.podeAdicionar || semPreco) return;
    aoAdicionar({
      chave: novaChave(),
      produtoId: produto.id,
      variacaoId,
      quantidade,
      escolhas,
      descricao: descreverItem(produto, variacaoId, escolhas),
      totalCentavos: conta.totalEmCentavos,
      antes: null,
    });
  }

  return (
    <section
      aria-label={`Montar ${produto.nome}`}
      className="sc-manual__montagem"
    >
      <h3 className="text-xl font-semibold">{produto.nome}</h3>

      {produto.variacoes.length > 0 ? (
        <label className="grid gap-1">
          <span className="font-medium">Variação (tamanho, sabor…)</span>
          <Seletor
            className="min-h-12"
            value={variacaoId ?? ""}
            onChange={(valor) => setVariacaoId(valor || null)}
          >
            {produto.variacoes.map((variacao) => (
              <option
                key={variacao.id}
                value={variacao.id}
                disabled={!variacao.disponivel}
              >
                {variacao.nome}
                {variacao.preco ? ` — ${variacao.preco}` : ""}
                {variacao.disponivel ? "" : " (esgotado)"}
              </option>
            ))}
          </Seletor>
        </label>
      ) : null}

      {gruposComuns(produto).map((grupo) => {
        const pendencia = conta.pendencias.find((p) => p.grupoId === grupo.id);
        return (
          <fieldset
            key={grupo.id}
            className="grid gap-2"
            id={`montar-grupo-${grupo.id}`}
          >
            <legend className="font-medium">
              {grupo.nome}{" "}
              <span className="text-sm text-[var(--cor-tinta-suave)]">
                {grupo.regra}
              </span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {grupo.opcoes.map((opcao) => {
                const marcada = escolhas.some(
                  (e) => e.grupoId === grupo.id && e.opcaoId === opcao.id,
                );
                return (
                  <label key={opcao.id} className="sc-manual__opcao">
                    <input
                      type={grupo.maximo === 1 ? "radio" : "checkbox"}
                      name={`montar-${grupo.id}`}
                      checked={marcada}
                      disabled={!opcao.disponivel}
                      onChange={() => alternar(grupo, opcao.id)}
                    />
                    <span>
                      {opcao.nome}
                      {opcao.acrescimo ? ` ${opcao.acrescimo}` : ""}
                    </span>
                  </label>
                );
              })}
            </div>
            {tentou && pendencia ? (
              <p className="sc-campo__erro" role="alert">
                {pendencia.explicacao}
              </p>
            ) : null}
          </fieldset>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium" id={`quantidade-${produto.id}`}>
          Quantidade (unidades)
        </span>
        <Botao
          variante="secundaria"
          aria-label="Menos um"
          onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
        >
          −
        </Botao>
        <output
          aria-labelledby={`quantidade-${produto.id}`}
          className="min-w-8 text-center text-lg font-semibold"
        >
          {quantidade}
        </output>
        <Botao
          variante="secundaria"
          aria-label="Mais um"
          onClick={() => setQuantidade((q) => Math.min(99, q + 1))}
        >
          +
        </Botao>
      </div>

      {tentou && (conta.pendencias.length > 0 || semPreco) ? (
        <Aviso tom="atencao" titulo="Falta escolher">
          {semPreco
            ? "Este item está sem preço no catálogo."
            : conta.pendencias.map((p) => p.explicacao).join(" ")}
        </Aviso>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Botao onClick={adicionar}>
          Adicionar — {escreverDinheiro(conta.totalEmCentavos)}
        </Botao>
        <Botao variante="discreta" onClick={aoCancelar}>
          Cancelar
        </Botao>
      </div>
    </section>
  );
}

/** Os itens da repetição que entram prontos, e o que fica de fora. */
function itensDaRepeticao(
  repeticao: RepeticaoDoPedido,
  produtos: readonly ProdutoParaMontar[],
): { readonly itens: ItemMontado[]; readonly avisos: string[] } {
  const itens: ItemMontado[] = [];
  const avisos: string[] = repeticao.indisponiveis.map(
    (item) =>
      `${item.nome}${item.variacao ? ` (${item.variacao})` : ""} saiu do catálogo — custava ${escreverDinheiro(item.precoUnitarioDaEpocaCentavos)}.`,
  );
  for (const item of repeticao.itens) {
    const produto = produtos.find((p) => p.id === item.produtoId);
    if (item.pendencias.length > 0 || produto === undefined) {
      avisos.push(
        `${item.nome}: ${item.pendencias.join(" ") || "escolha de novo."}`,
      );
      continue;
    }
    itens.push({
      chave: novaChave(),
      produtoId: item.produtoId,
      variacaoId: item.variacaoId,
      quantidade: item.quantidade,
      escolhas: item.escolhas,
      descricao: descreverItem(produto, item.variacaoId, item.escolhas),
      totalCentavos: item.totalDaLinhaCentavos,
      antes:
        item.precoUnitarioDaEpocaCentavos === item.precoUnitarioCentavos
          ? null
          : `custava ${escreverDinheiro(item.precoUnitarioDaEpocaCentavos)} cada`,
    });
  }
  return { itens, avisos };
}

export function MontarPedido({
  produtos,
  clienteId = null,
  repetirPedidoId = null,
  buscar = fetch,
  carregarDetalhe,
  lancar,
}: MontarPedidoProps) {
  const [nomeDaFicha, setNomeDaFicha] = useState<string | null>(null);
  const [modoDoCliente, setModoDoCliente] = useState<"existente" | "novo">(
    "existente",
  );
  const [escolhido, setEscolhido] = useState<ClienteDaLista | null>(null);
  const [guardarCliente, setGuardarCliente] = useState(true);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [itens, setItens] = useState<readonly ItemMontado[]>([]);
  const [avisosDaRepeticao, setAvisosDaRepeticao] = useState<readonly string[]>(
    [],
  );
  const [escolhendo, setEscolhendo] = useState<string | null>(null);
  const [detalheDoProduto, setDetalheDoProduto] =
    useState<ProdutoParaMontar | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [erroDoDetalhe, setErroDoDetalhe] = useState<string | null>(null);
  const detalhesEmCache = useRef(new Map<string, ProdutoParaMontar>());
  const leiturasEmCurso = useRef(
    new Map<string, Promise<ProdutoParaMontar | null>>(),
  );
  const pedidoDeDetalhe = useRef(0);
  const [entrega, setEntrega] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [pagamento, setPagamento] = useState<FormaDePagamento>("PIX");
  const [trocoPara, setTrocoPara] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [recusa, setRecusa] = useState<string | null>(null);
  const [recusasDosCampos, setRecusasDosCampos] = useState<
    Record<string, string>
  >({});
  const [criado, setCriado] = useState<PedidoManualCriado | null>(null);

  useEffect(() => {
    if (!clienteId) return;
    void buscarFicha(clienteId, buscar).then((leitura) => {
      if (leitura.estado === "ok") setNomeDaFicha(leitura.ficha.cliente.nome);
    });
  }, [buscar, clienteId]);

  useEffect(() => {
    if (!repetirPedidoId) return;
    void pedirRepeticao(repetirPedidoId, buscar).then(async (leitura) => {
      if (leitura.estado !== "ok") {
        setAvisosDaRepeticao([
          "Não foi possível montar a repetição agora. Monte o pedido à mão.",
        ]);
        return;
      }
      const repeticao = leitura.repeticao;
      // A lista do balcão vem sem grupos: para nomear as opções da repetição,
      // lê a ficha completa dos produtos que têm escolhas (D-2).
      const completos = await Promise.all(
        produtos.map(async (produto) => {
          const precisa = repeticao.itens.some(
            (item) => item.produtoId === produto.id && item.escolhas.length > 0,
          );
          if (!precisa || produto.grupos.length > 0 || !carregarDetalhe) {
            return produto;
          }
          try {
            return (await carregarDetalhe(produto.id)) ?? produto;
          } catch {
            return produto;
          }
        }),
      );
      const { itens: prontos, avisos } = itensDaRepeticao(
        repeticao,
        completos,
      );
      setItens(prontos);
      setAvisosDaRepeticao(avisos);
      if (repeticao.entrega === "DELIVERY") setEntrega("DELIVERY");
    });
  }, [buscar, carregarDetalhe, produtos, repetirPedidoId]);

  const subtotal = useMemo(
    () => itens.reduce((soma, item) => soma + item.totalCentavos, 0),
    [itens],
  );
  const produtoEmMontagem =
    detalheDoProduto?.id === escolhendo ? detalheDoProduto : null;
  const vendaveis = produtos.filter((p) => p.disponivel);

  async function escolherProduto(produtoId: string): Promise<void> {
    const pedido = ++pedidoDeDetalhe.current;
    setEscolhendo(produtoId || null);
    setDetalheDoProduto(null);
    setErroDoDetalhe(null);
    if (produtoId === "") {
      setCarregandoDetalhe(false);
      return;
    }

    const guardado = detalhesEmCache.current.get(produtoId);
    if (guardado) {
      setDetalheDoProduto(guardado);
      setCarregandoDetalhe(false);
      return;
    }

    // Componentes que já recebem fichas completas (ex.: testes e repetição)
    // continuam funcionando; a página do balcão passa a ação sob demanda.
    if (!carregarDetalhe) {
      const ficha = produtos.find((p) => p.id === produtoId) ?? null;
      setDetalheDoProduto(ficha);
      setCarregandoDetalhe(false);
      return;
    }

    setCarregandoDetalhe(true);
    let leitura = leiturasEmCurso.current.get(produtoId);
    if (!leitura) {
      leitura = carregarDetalhe(produtoId);
      leiturasEmCurso.current.set(produtoId, leitura);
    }
    try {
      const ficha = await leitura;
      if (ficha) detalhesEmCache.current.set(produtoId, ficha);
      if (pedido !== pedidoDeDetalhe.current) return;
      if (!ficha) {
        setErroDoDetalhe("Não foi possível carregar este produto.");
      } else {
        setDetalheDoProduto(ficha);
      }
    } catch {
      if (pedido === pedidoDeDetalhe.current) {
        setErroDoDetalhe("Não foi possível carregar este produto.");
      }
    } finally {
      if (leiturasEmCurso.current.get(produtoId) === leitura) {
        leiturasEmCurso.current.delete(produtoId);
      }
      if (pedido === pedidoDeDetalhe.current) setCarregandoDetalhe(false);
    }
  }

  async function confirmar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    // A ficha vem da URL (pedido nascido da ficha) ou da escolha na lista.
    let fichaId: string | null = clienteId ?? escolhido?.id ?? null;
    const novo = fichaId === null && modoDoCliente === "novo";
    const faltando: Record<string, string> = {};
    if (fichaId === null && modoDoCliente === "existente") {
      faltando.cliente =
        "Escolha um cliente da lista ou use “Cliente novo” para cadastrar.";
    }
    if (novo && nome.trim().length < 2)
      faltando.nome = "Informe o nome de quem pede.";
    if (novo && telefone.trim() === "") {
      faltando.telefone = "Informe o telefone, com o código de área.";
    }
    if (
      entrega === "DELIVERY" &&
      fichaId === null &&
      logradouro.trim() === ""
    ) {
      faltando.logradouro = "Informe a rua da entrega.";
    }
    // Troco é opcional: em branco, o cliente paga o valor certo.
    const trocoEmCentavos =
      pagamento === "CASH" && trocoPara.trim() !== ""
        ? centavosDoTexto(trocoPara)
        : null;
    if (pagamento === "CASH" && trocoPara.trim() !== "") {
      if (trocoEmCentavos === null || trocoEmCentavos <= 0) {
        faltando.troco = "Escreva só o valor em reais. Ex.: 50 ou 50,00.";
      } else if (trocoEmCentavos <= subtotal) {
        faltando.troco = `O troco é para um valor MAIOR que o total (${escreverDinheiro(subtotal)}). Se o cliente paga o valor certo, deixe em branco.`;
      }
    }
    setRecusasDosCampos(faltando);
    setRecusa(itens.length === 0 ? "Adicione ao menos um item." : null);
    if (Object.keys(faltando).length > 0 || itens.length === 0) return;

    const endereco =
      entrega === "DELIVERY" && logradouro.trim() !== ""
        ? {
            logradouro: logradouro.trim(),
            numero: numero.trim() || null,
            bairro: bairro.trim() || null,
          }
        : null;
    setEnviando(true);
    // Cliente novo entra na lista da loja (se o dono deixou marcado), para o
    // próximo pedido dele já achá-lo. Se o cadastro não der, o pedido sai do
    // mesmo jeito, só com nome e telefone: a venda vale mais que a ficha.
    if (novo && guardarCliente) {
      const ficha = await cadastrarCliente(
        { nome: nome.trim(), telefone: telefone.trim() },
        buscar,
      );
      if (ficha.estado === "salvo") fichaId = ficha.ficha.id;
      else if (ficha.estado === "existente")
        fichaId = ficha.existente.clienteId;
    }
    const pedido: PedidoManualParaCriar = {
      cliente: fichaId
        ? { tipo: "cadastrado", clienteId: fichaId }
        : { tipo: "avulso", nome: nome.trim(), telefone: telefone.trim() },
      itens: itens.map((item) => ({
        produtoId: item.produtoId,
        variacaoId: item.variacaoId,
        quantidade: item.quantidade,
        escolhas: [...item.escolhas],
      })),
      entrega,
      ...(endereco === null ? {} : { endereco }),
      formaDePagamento: pagamento,
      ...(trocoEmCentavos === null ? {} : { trocoParaCentavos: trocoEmCentavos }),
      observacao: observacao.trim() || null,
    };

    const resultado = await (lancar ?? ((p) => lancarPedidoManual(p, buscar)))(
      pedido,
    );
    setEnviando(false);
    switch (resultado.estado) {
      case "criado":
        setCriado(resultado.pedido);
        return;
      case "incompleto":
        setRecusa(
          resultado.pendencias
            .map((p) => `${p.produto}: ${p.explicacao}`)
            .join(" "),
        );
        return;
      case "recusado":
        setRecusa(resultado.motivo);
        return;
      case "erro":
        setRecusa(
          "Não foi possível lançar agora. Nada foi perdido — tente de novo.",
        );
        return;
    }
  }

  if (criado !== null) {
    return (
      <Sucesso
        titulo={`Pedido ${codigoDoPedido(criado.numero)} lançado`}
        descricao={`Total de ${escreverDinheiro(criado.totalCentavos)}. Ele já está no quadro, em “Pedido gerado”, marcado como balcão.`}
        acao={
          <span className="flex flex-wrap justify-center gap-3">
            <Link
              className="sc-botao sc-botao--primaria"
              href="/painel/pedidos"
            >
              Ver no quadro
            </Link>
            <Link
              className="sc-botao sc-botao--secundaria"
              href={`/painel/pedidos/${criado.id}`}
            >
              Abrir o pedido
            </Link>
          </span>
        }
      />
    );
  }

  return (
    <form
      aria-label="Montar pedido manual"
      className="sc-manual"
      noValidate
      onSubmit={(evento) => void confirmar(evento)}
    >
      <section aria-labelledby="quem-pede" className="sc-manual__secao">
        <h2 className="sc-manual__titulo" id="quem-pede">
          Quem pede
        </h2>
        {clienteId ? (
          <p className="text-lg">
            Pedido para <strong>{nomeDaFicha ?? "o cliente da ficha"}</strong>
          </p>
        ) : (
          <>
            <div
              className="sc-kanban__visoes"
              role="group"
              aria-label="Tipo de cliente"
            >
              <button
                type="button"
                className="sc-kanban__visao"
                aria-pressed={modoDoCliente === "existente"}
                onClick={() => setModoDoCliente("existente")}
              >
                Cliente cadastrado
              </button>
              <button
                type="button"
                className="sc-kanban__visao"
                aria-pressed={modoDoCliente === "novo"}
                onClick={() => setModoDoCliente("novo")}
              >
                Cliente novo
              </button>
              <Info
                rotulo="o tipo de cliente"
                conteudo={{
                  texto:
                    "Cliente cadastrado: alguém que já está na sua lista; o pedido entra no histórico dele. Cliente novo: quem pede pela primeira vez; basta nome e telefone.",
                }}
              />
            </div>
            {modoDoCliente === "existente" ? (
              <EscolherCliente
                escolhido={escolhido}
                aoEscolher={setEscolhido}
                buscar={buscar}
                erro={recusasDosCampos.cliente}
              />
            ) : (
              <>
                <Campo
                  id="manual-nome"
                  rotulo="Nome de quem pede"
                  obrigatorio
                  autoComplete="off"
                  placeholder="Ex.: Ana Ribeiro"
                  value={nome}
                  onChange={(evento) => setNome(evento.target.value)}
                  erro={recusasDosCampos.nome}
                />
                <Campo
                  id="manual-telefone"
                  rotulo="Telefone com DDD"
                  obrigatorio
                  type="tel"
                  inputMode="tel"
                  placeholder="Ex.: (85) 99999-1234"
                  value={telefone}
                  onChange={(evento) => setTelefone(evento.target.value)}
                  erro={recusasDosCampos.telefone}
                />
                <span className="flex items-center gap-1">
                  <label className="sc-manual__opcao flex-1">
                    <input
                      type="checkbox"
                      checked={guardarCliente}
                      aria-describedby="manual-guardar-info"
                      onChange={(evento) =>
                        setGuardarCliente(evento.target.checked)
                      }
                    />
                    Guardar na lista de clientes da loja
                  </label>
                  <Info
                    id="manual-guardar"
                    rotulo="guardar na lista de clientes"
                    conteudo={{
                      texto:
                        "Marcado: a pessoa entra na sua lista de clientes (origem “Cadastrado pelo dono”) e no próximo pedido é só buscar pelo nome. Desmarcado: o pedido sai só com nome e telefone, sem ficha.",
                    }}
                  />
                </span>
              </>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="o-que-pede" className="sc-manual__secao">
        <h2 className="sc-manual__titulo" id="o-que-pede">
          O que pede
        </h2>
        {avisosDaRepeticao.length > 0 ? (
          <Aviso tom="atencao" titulo="O que mudou desde o pedido antigo">
            <ul className="list-disc pl-5">
              {avisosDaRepeticao.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          </Aviso>
        ) : null}

        {itens.length > 0 ? (
          <ul className="grid gap-2" aria-label="Itens do pedido">
            {itens.map((item) => (
              <li key={item.chave} className="sc-manual__item">
                <span>
                  {item.quantidade}× {item.descricao}
                  {item.antes ? (
                    <span className="block text-sm text-[var(--cor-tinta-suave)]">
                      Preço de hoje ({item.antes})
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2">
                  <strong>{escreverDinheiro(item.totalCentavos)}</strong>
                  <Botao
                    variante="discreta"
                    tamanho="pequeno"
                    aria-label={`Tirar ${item.descricao}`}
                    onClick={() =>
                      setItens((atuais) =>
                        atuais.filter((i) => i.chave !== item.chave),
                      )
                    }
                  >
                    Tirar
                  </Botao>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[var(--cor-tinta-suave)]">Nenhum item ainda.</p>
        )}

        {escolhendo !== null && carregandoDetalhe ? (
          <div>
            <p role="status" aria-live="polite">
              Carregando opções do produto…
            </p>
            <Botao
              variante="discreta"
              onClick={() => void escolherProduto("")}
            >
              Cancelar
            </Botao>
          </div>
        ) : erroDoDetalhe !== null ? (
          <Aviso tom="atencao" titulo="Não foi possível abrir o produto">
            <p>{erroDoDetalhe}</p>
            <div className="flex flex-wrap gap-3">
              <Botao
                variante="discreta"
                onClick={() => {
                  if (escolhendo !== null) void escolherProduto(escolhendo);
                }}
              >
                Tentar de novo
              </Botao>
              <Botao
                variante="discreta"
                onClick={() => void escolherProduto("")}
              >
                Cancelar
              </Botao>
            </div>
          </Aviso>
        ) : produtoEmMontagem !== null ? (
          <ItemEmMontagem
            key={produtoEmMontagem.id}
            produto={produtoEmMontagem}
            aoCancelar={() => setEscolhendo(null)}
            aoAdicionar={(item) => {
              setItens((atuais) => [...atuais, item]);
              setEscolhendo(null);
            }}
          />
        ) : (
          <label className="grid gap-1">
            <span className="font-medium">Adicionar produto ao pedido</span>
            <Seletor
              className="min-h-12"
              value=""
              onChange={(valor) => void escolherProduto(valor)}
            >
              <option value="">Escolha um produto…</option>
              {vendaveis.map((produto) => (
                <option key={produto.id} value={produto.id}>
                  {produto.nome}
                  {produto.precoCentavos === null
                    ? ""
                    : ` — ${escreverDinheiro(produto.precoCentavos)}`}
                </option>
              ))}
            </Seletor>
          </label>
        )}
      </section>

      <section aria-labelledby="como-recebe" className="sc-manual__secao">
        <h2 className="sc-manual__titulo" id="como-recebe">
          Como recebe e paga
        </h2>
        <fieldset className="grid gap-2">
          <legend className="mb-1 inline-flex items-center gap-1 font-medium">
            Forma de entrega
            <Info
              rotulo="a forma de entrega"
              conteudo={{
                texto:
                  "Retirada na loja: o cliente busca, e o pedido passa pela etapa Retirada. Entrega no endereço: a loja leva, e o pedido passa por Saiu para entrega.",
              }}
            />
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["PICKUP", "Retirada na loja"],
              ["DELIVERY", "Entrega no endereço"],
            ] as const
          ).map(([valor, rotulo]) => (
            <label key={valor} className="sc-manual__opcao">
              <input
                type="radio"
                name="manual-entrega"
                checked={entrega === valor}
                onChange={() => setEntrega(valor)}
              />
              {rotulo}
            </label>
          ))}
          </div>
        </fieldset>
        {entrega === "DELIVERY" ? (
          <div className="grid gap-3">
            {clienteId ? (
              <p className="text-sm text-[var(--cor-tinta-suave)]">
                Deixe a rua em branco para entregar no endereço da ficha.
              </p>
            ) : null}
            <Campo
              id="manual-logradouro"
              rotulo={clienteId ? "Rua da entrega (opcional)" : "Rua da entrega"}
              obrigatorio={!clienteId}
              placeholder="Ex.: Rua das Flores"
              value={logradouro}
              onChange={(evento) => setLogradouro(evento.target.value)}
              erro={recusasDosCampos.logradouro}
            />
            <Campo
              id="manual-numero"
              rotulo="Número (opcional)"
              inputMode="numeric"
              placeholder="Ex.: 123 ou s/n"
              value={numero}
              onChange={(evento) => setNumero(evento.target.value)}
            />
            <Campo
              id="manual-bairro"
              rotulo="Bairro (opcional)"
              placeholder="Ex.: Aldeota"
              value={bairro}
              onChange={(evento) => setBairro(evento.target.value)}
            />
          </div>
        ) : null}
        <Campo
          id="manual-pagamento"
          rotulo="Forma de pagamento"
          info={{
            texto:
              "Como o cliente vai pagar quando receber. Aparece no pedido e no cupom impresso, para quem entrega cobrar certo. Use “A combinar” quando ainda não decidiram.",
          }}
          controle={
          <Seletor
            id="manual-pagamento"
            aria-describedby={descritoresDoCampo("manual-pagamento", {
              info: true,
            }).join(" ")}
            className="min-h-12"
            value={pagamento}
            onChange={(valor) =>
              setPagamento(valor as FormaDePagamento)
            }
          >
            {FORMAS_DE_PAGAMENTO.map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </Seletor>
          }
        />
        {pagamento === "CASH" ? (
          <Campo
            id="manual-troco"
            rotulo="Troco para quanto? (R$, opcional)"
            inputMode="decimal"
            placeholder="Ex.: 50,00"
            dica="Em branco: o cliente paga o valor certo, sem troco."
            info={{
              texto:
                "Com quanto o cliente vai pagar em dinheiro, para o entregador já levar o troco. Precisa ser maior que o total do pedido.",
              exemplo: "pedido de R$ 37,00 e o cliente paga com uma nota de R$ 50,00.",
            }}
            value={trocoPara}
            onChange={(evento) => setTrocoPara(evento.target.value)}
            erro={recusasDosCampos.troco}
          />
        ) : null}
        <Campo
          id="manual-observacao"
          rotulo="Observação do pedido (opcional)"
          placeholder="Ex.: sem cebola; tocar o interfone 2"
          maxLength={MAXIMO_DA_OBSERVACAO}
          info={{
            texto:
              "Recado sobre o pedido inteiro, para quem prepara e para quem entrega. Aparece no pedido aberto e no cupom impresso.",
            exemplo: "sem cebola em todos; tocar o interfone 2.",
          }}
          value={observacao}
          onChange={(evento) => setObservacao(evento.target.value)}
        />
      </section>

      <section
        aria-label="Confirmar"
        className="sc-manual__secao sc-manual__secao--confirmar"
      >
        <p className="text-lg">
          Subtotal estimado: <strong>{escreverDinheiro(subtotal)}</strong>
          <span className="block text-sm text-[var(--cor-tinta-suave)]">
            A loja confere os preços de agora ao confirmar.
          </span>
        </p>
        {recusa !== null ? <Aviso tom="erro">{recusa}</Aviso> : null}
        <Botao type="submit" carregando={enviando} rotuloDeEspera="Lançando…">
          Confirmar pedido
        </Botao>
      </section>
    </form>
  );
}
