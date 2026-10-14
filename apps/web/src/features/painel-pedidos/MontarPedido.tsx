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
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Aviso, Botao, Campo, Sucesso } from "@simpleclick/ui";

import {
  buscarFicha,
  lancarPedidoManual,
  pedirRepeticao,
  type Buscar,
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

/** O produto como a montagem precisa dele: o da página do produto. */
export interface ProdutoParaMontar {
  readonly id: string;
  readonly nome: string;
  readonly precoCentavos: number | null;
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
  /** Quem lança. Padrão: a rota do painel. */
  readonly lancar?:
    | ((pedido: PedidoManualParaCriar) => Promise<ResultadoDoLancamento>)
    | undefined;
}

const FORMAS_DE_PAGAMENTO = [
  ["PIX", "PIX"],
  ["CASH", "Dinheiro"],
  ["CARD_ON_DELIVERY", "Cartão na entrega"],
  ["OTHER", "Outro"],
] as const;

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
      className="grid gap-4 rounded-[var(--raio-cartao)] border-2 border-[var(--cor-primaria)] bg-[var(--cor-superficie-alta)] p-4"
    >
      <h3 className="text-xl font-semibold">{produto.nome}</h3>

      {produto.variacoes.length > 0 ? (
        <label className="grid gap-1">
          <span className="font-medium">Variação</span>
          <select
            className="sc-campo__controle min-h-12"
            value={variacaoId ?? ""}
            onChange={(evento) => setVariacaoId(evento.target.value || null)}
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
          </select>
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
                  <label
                    key={opcao.id}
                    className="flex min-h-12 items-center gap-3 rounded-[var(--raio)] border border-[var(--cor-borda)] px-3"
                  >
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
          Quantidade
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
  lancar,
}: MontarPedidoProps) {
  const [nomeDaFicha, setNomeDaFicha] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [itens, setItens] = useState<readonly ItemMontado[]>([]);
  const [avisosDaRepeticao, setAvisosDaRepeticao] = useState<readonly string[]>(
    [],
  );
  const [escolhendo, setEscolhendo] = useState<string | null>(null);
  const [entrega, setEntrega] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [pagamento, setPagamento] = useState<FormaDePagamento>("PIX");
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
    void pedirRepeticao(repetirPedidoId, buscar).then((leitura) => {
      if (leitura.estado !== "ok") {
        setAvisosDaRepeticao([
          "Não foi possível montar a repetição agora. Monte o pedido à mão.",
        ]);
        return;
      }
      const { itens: prontos, avisos } = itensDaRepeticao(
        leitura.repeticao,
        produtos,
      );
      setItens(prontos);
      setAvisosDaRepeticao(avisos);
      if (leitura.repeticao.entrega === "DELIVERY") setEntrega("DELIVERY");
    });
  }, [buscar, produtos, repetirPedidoId]);

  const subtotal = useMemo(
    () => itens.reduce((soma, item) => soma + item.totalCentavos, 0),
    [itens],
  );
  const produtoEmMontagem = produtos.find((p) => p.id === escolhendo) ?? null;
  const vendaveis = produtos.filter((p) => p.disponivel);

  async function confirmar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const faltando: Record<string, string> = {};
    if (!clienteId && nome.trim().length < 2)
      faltando.nome = "Informe o nome de quem pede.";
    if (!clienteId && telefone.trim() === "") {
      faltando.telefone = "Informe o telefone, com o código de área.";
    }
    if (entrega === "DELIVERY" && !clienteId && logradouro.trim() === "") {
      faltando.logradouro = "Informe a rua da entrega.";
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
    const pedido: PedidoManualParaCriar = {
      cliente: clienteId
        ? { tipo: "cadastrado", clienteId }
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
      observacao: observacao.trim() || null,
    };

    setEnviando(true);
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
        titulo={`Pedido #${criado.numero} lançado`}
        descricao={`Total de ${escreverDinheiro(criado.totalCentavos)}. Ele já está na fila, marcado como balcão.`}
        acao={
          <Link
            className="sc-botao sc-botao--primaria"
            href={`/painel/pedidos/${criado.id}`}
          >
            Abrir o pedido
          </Link>
        }
      />
    );
  }

  return (
    <form
      aria-label="Montar pedido manual"
      className="mx-auto grid max-w-2xl gap-8"
      noValidate
      onSubmit={(evento) => void confirmar(evento)}
    >
      <section aria-labelledby="quem-pede" className="grid gap-3">
        <h2 className="text-2xl font-semibold" id="quem-pede">
          Quem pede
        </h2>
        {clienteId ? (
          <p className="text-lg">
            Pedido para <strong>{nomeDaFicha ?? "o cliente da ficha"}</strong>
          </p>
        ) : (
          <>
            <p className="text-[var(--cor-tinta-suave)]">
              Sem cadastro: nome e telefone bastam.
            </p>
            <Campo
              id="manual-nome"
              rotulo="Nome"
              obrigatorio
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              erro={recusasDosCampos.nome}
            />
            <Campo
              id="manual-telefone"
              rotulo="Telefone"
              obrigatorio
              type="tel"
              inputMode="tel"
              value={telefone}
              onChange={(evento) => setTelefone(evento.target.value)}
              erro={recusasDosCampos.telefone}
            />
          </>
        )}
      </section>

      <section aria-labelledby="o-que-pede" className="grid gap-3">
        <h2 className="text-2xl font-semibold" id="o-que-pede">
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
              <li
                key={item.chave}
                className="flex items-start justify-between gap-3 rounded-[var(--raio)] border border-[var(--cor-borda)] p-3"
              >
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

        {produtoEmMontagem !== null ? (
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
            <span className="font-medium">Acrescentar produto</span>
            <select
              className="sc-campo__controle min-h-12"
              value=""
              onChange={(evento) => setEscolhendo(evento.target.value || null)}
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
            </select>
          </label>
        )}
      </section>

      <section aria-labelledby="como-recebe" className="grid gap-3">
        <h2 className="text-2xl font-semibold" id="como-recebe">
          Como recebe e paga
        </h2>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Forma de entrega</legend>
          {(
            [
              ["PICKUP", "Retirada na loja"],
              ["DELIVERY", "Entrega"],
            ] as const
          ).map(([valor, rotulo]) => (
            <label
              key={valor}
              className="flex min-h-12 items-center gap-3 rounded-[var(--raio)] border border-[var(--cor-borda)] px-3"
            >
              <input
                type="radio"
                name="manual-entrega"
                checked={entrega === valor}
                onChange={() => setEntrega(valor)}
              />
              {rotulo}
            </label>
          ))}
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
              rotulo="Rua"
              value={logradouro}
              onChange={(evento) => setLogradouro(evento.target.value)}
              erro={recusasDosCampos.logradouro}
            />
            <Campo
              id="manual-numero"
              rotulo="Número"
              value={numero}
              onChange={(evento) => setNumero(evento.target.value)}
            />
            <Campo
              id="manual-bairro"
              rotulo="Bairro"
              value={bairro}
              onChange={(evento) => setBairro(evento.target.value)}
            />
          </div>
        ) : null}
        <label className="grid gap-1">
          <span className="font-medium">Pagamento</span>
          <select
            className="sc-campo__controle min-h-12"
            value={pagamento}
            onChange={(evento) =>
              setPagamento(evento.target.value as FormaDePagamento)
            }
          >
            {FORMAS_DE_PAGAMENTO.map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>
        <Campo
          id="manual-observacao"
          rotulo="Observação (opcional)"
          value={observacao}
          onChange={(evento) => setObservacao(evento.target.value)}
        />
      </section>

      <section aria-label="Confirmar" className="grid gap-3">
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
