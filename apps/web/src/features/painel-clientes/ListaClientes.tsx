"use client";

/**
 * A lista de clientes da loja (AC-700, AC-701).
 *
 * O QUE O DONO PRECISA PARA ATENDER, E SÓ ISSO: nome, telefone, quantos
 * pedidos, quanto gastou e quando comprou por último. É por esta tela que ele
 * descobre quem sumiu — e por isso a ordem é a do último pedido.
 *
 * QUATRO ESTADOS, todos desenhados: carregando, erro com "tentar de novo",
 * vazio (com a diferença entre "ainda não há clientes" e "nada encontrado") e
 * a lista.
 *
 * BUSCA, FILTROS E ORDEM VÃO AO SERVIDOR (card #77), página a página: a busca
 * acha por nome (sem acento), e-mail ou telefone (por dígitos), e a ordem por
 * nome ignora acento — "Íris" fica entre "Iara" e "Jair". A consulta fica no
 * endereço, para voltar, recarregar ou mandar o link.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Botao,
  Carregando,
  type ColunaDaTabela,
  Erro,
  Selo,
  Tabela,
  Vazio,
} from "@simpleclick/ui";

import {
  buscarClientes,
  cadastrarCliente,
  escreverData,
  escreverTelefone,
  type Buscar,
  type ClienteDaLista,
  type FichaDoCliente,
} from "../../lib/clientes-do-painel.ts";
import { escreverDinheiro } from "../../lib/dinheiro.ts";
import {
  Atalho,
  BarraDeFiltros,
} from "../painel-filtros/BarraDeFiltros.tsx";
import {
  Paginacao,
  parametrosDaConsulta,
  useConsultaNaUrl,
  useLeituraMaisRecente,
} from "../painel-estoque/lista-paginada.tsx";
import { FormularioCliente } from "./FormularioCliente.tsx";

interface Pagina {
  readonly clientes: readonly ClienteDaLista[];
  readonly total: number;
  readonly todos: number;
  readonly pagina: number;
  readonly porPagina: number;
  readonly totalDePaginas: number;
}

export interface ListaClientesProps {
  /** A rede. A prova troca por uma que responde sem servidor. */
  readonly buscar?: Buscar | undefined;
  /** Para onde ir depois do cadastro. Padrão: a ficha do cliente novo. */
  readonly aoCadastrar?: ((ficha: FichaDoCliente) => void) | undefined;
}

/** As colunas: o que o dono precisa para atender, na ordem em que lê. */
const COLUNAS: readonly ColunaDaTabela<ClienteDaLista>[] = [
  {
    chave: "nome",
    titulo: "Cliente",
    celula: (cliente) => (
      <span className="inline-flex flex-wrap items-center gap-2">
        <Link
          className="font-semibold text-[var(--cor-tinta)] no-underline hover:underline"
          href={`/painel/clientes/${cliente.id}`}
          data-cliente={cliente.id}
        >
          {cliente.nome}
        </Link>
        {cliente.temConta ? (
          <Selo tom="info" semBolinha>
            Tem conta no SimpleClick
          </Selo>
        ) : null}
      </span>
    ),
  },
  {
    chave: "telefone",
    titulo: "Telefone",
    celula: (cliente) => escreverTelefone(cliente.telefone),
  },
  {
    chave: "pedidos",
    titulo: "Pedidos",
    alinhamento: "fim",
    celula: (cliente) => cliente.totalDePedidos,
  },
  {
    chave: "total",
    titulo: "Total gasto",
    alinhamento: "fim",
    celula: (cliente) => (
      <strong>{escreverDinheiro(cliente.totalGastoCentavos)}</strong>
    ),
  },
  {
    chave: "ultimo",
    titulo: "Último pedido",
    celula: (cliente) =>
      cliente.ultimoPedidoEm === null ? (
        <span className="text-[var(--cor-tinta-suave)]">Nunca pediu</span>
      ) : (
        escreverData(cliente.ultimoPedidoEm)
      ),
  },
];

const CONSULTA_PADRAO = {
  busca: "",
  pedidos: "",
  cadastro: "",
  inativos: "",
  origem: "",
  ordem: "recentes",
  pagina: "1",
} as const;

const LIMPO = {
  busca: "",
  pedidos: "",
  cadastro: "",
  inativos: "",
  origem: "",
} as const;

/** Como o dono ordena a lista: quem comprou por último é o padrão. */
const ORDENACOES = [
  { valor: "recentes", rotulo: "Comprou por último" },
  { valor: "antigos", rotulo: "Comprou há mais tempo" },
  { valor: "nome", rotulo: "Nome (A a Z)" },
  { valor: "nome-desc", rotulo: "Nome (Z a A)" },
  { valor: "gasto", rotulo: "Quem mais gastou" },
  { valor: "pedidos", rotulo: "Mais pedidos" },
  { valor: "cadastro", rotulo: "Cadastrados há menos tempo" },
] as const;

export function ListaClientes({
  buscar = fetch,
  aoCadastrar,
}: ListaClientesProps) {
  const [consulta, mudar] = useConsultaNaUrl(CONSULTA_PADRAO);
  const [pagina, setPagina] = useState<Pagina | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falhou, setFalhou] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);
  const lerMaisRecente = useLeituraMaisRecente();

  const carregar = useCallback(async () => {
    if (consulta === null) return;
    setCarregando(true);
    setFalhou(false);
    const parametros = Object.fromEntries(
      parametrosDaConsulta(consulta, CONSULTA_PADRAO),
    );
    // `inativos` na tela, `inativosDias` na API; sempre pagina (a lista é grande).
    const { inativos, ...resto } = parametros;
    const pedido: Record<string, string> = {
      ...resto,
      pagina: consulta.pagina,
      ...(inativos === undefined ? {} : { inativosDias: inativos }),
    };
    const { resultado, valeu } = await lerMaisRecente(() =>
      buscarClientes(pedido, buscar),
    );
    if (!valeu) return;
    if (resultado.estado === "ok") {
      const clientes = resultado.clientes;
      setPagina({
        clientes,
        total: resultado.total ?? clientes.length,
        todos: resultado.todos ?? clientes.length,
        pagina: resultado.pagina ?? 1,
        porPagina: resultado.porPagina ?? Math.max(clientes.length, 1),
        totalDePaginas: resultado.totalDePaginas ?? 1,
      });
    } else {
      setFalhou(true);
    }
    setCarregando(false);
  }, [consulta, buscar, lerMaisRecente]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function depoisDoCadastro(ficha: FichaDoCliente) {
    setCadastrando(false);
    if (aoCadastrar) aoCadastrar(ficha);
    else window.location.assign(`/painel/clientes/${ficha.id}`);
  }

  const ligados =
    consulta === null
      ? 0
      : [consulta.pedidos, consulta.cadastro, consulta.inativos, consulta.origem]
          .filter((valor) => valor !== "").length;
  const filtrado = consulta !== null && (ligados > 0 || consulta.busca !== "");
  const soGastaram = consulta?.ordem === "gasto";

  return (
    <section aria-labelledby="titulo-clientes">
      <div className="sc-clientes__ferramentas">
        <h2 className="sr-only" id="titulo-clientes">
          Clientes da loja
        </h2>
        <Botao onClick={() => setCadastrando((aberto) => !aberto)}>
          {cadastrando ? "Fechar cadastro" : "Cadastrar cliente"}
        </Botao>
      </div>

      {cadastrando ? (
        <div className="mt-6">
          <FormularioCliente
            titulo="Novo cliente"
            enviar={(dados) => cadastrarCliente(dados, buscar)}
            aoSalvar={depoisDoCadastro}
          />
        </div>
      ) : null}

      {consulta !== null && (pagina === null || pagina.todos > 0) ? (
        <BarraDeFiltros
          rotuloDaBusca="Buscar clientes"
          placeholder="Buscar por nome, telefone ou e-mail"
          busca={consulta.busca}
          aoBuscar={(busca) => mudar({ busca })}
          filtros={[
            {
              tipo: "selecao",
              id: "pedidos",
              rotulo: "Pedidos",
              valor: consulta.pedidos,
              opcoes: [
                { valor: "", rotulo: "Todos" },
                { valor: "com", rotulo: "Já fizeram pedido" },
                { valor: "sem", rotulo: "Nunca pediram" },
              ],
              aoMudar: (pedidos) => mudar({ pedidos }),
            },
            {
              tipo: "selecao",
              id: "cadastro",
              rotulo: "Cadastro",
              valor: consulta.cadastro,
              opcoes: [
                { valor: "", rotulo: "Qualquer data" },
                { valor: "recentes", rotulo: "Recém-cadastrados (30 dias)" },
              ],
              aoMudar: (cadastro) => mudar({ cadastro }),
            },
            {
              tipo: "selecao",
              id: "inativos",
              rotulo: "Sem comprar há",
              valor: consulta.inativos,
              opcoes: [
                { valor: "", rotulo: "Sem filtro" },
                { valor: "30", rotulo: "Mais de 30 dias" },
                { valor: "60", rotulo: "Mais de 60 dias" },
                { valor: "90", rotulo: "Mais de 90 dias" },
              ],
              aoMudar: (inativos) => mudar({ inativos }),
            },
            {
              tipo: "selecao",
              id: "origem",
              rotulo: "Origem",
              valor: consulta.origem,
              opcoes: [
                { valor: "", rotulo: "Todas" },
                { valor: "importados", rotulo: "Importados de planilha" },
              ],
              aoMudar: (origem) => mudar({ origem }),
            },
          ]}
          ordem={{
            valor: consulta.ordem,
            opcoes: ORDENACOES,
            aoMudar: (ordem) => mudar({ ordem }),
          }}
          ligados={ligados}
          filtrado={filtrado}
          aoLimpar={() => mudar(LIMPO)}
          contagem={
            pagina === null
              ? "Carregando clientes…"
              : pagina.total === pagina.todos
                ? `${pagina.todos.toLocaleString("pt-BR")} cliente(s)`
                : `${pagina.total.toLocaleString("pt-BR")} de ${pagina.todos.toLocaleString("pt-BR")} cliente(s)`
          }
          atalhos={
            <Atalho
              ativo={soGastaram}
              aoAlternar={() => mudar({ ordem: soGastaram ? "recentes" : "gasto" })}
            >
              Quem mais gastou
            </Atalho>
          }
        />
      ) : null}

      <div className="sc-clientes__lista" aria-live="polite">
        {carregando && pagina === null ? (
          <Carregando rotulo="Carregando clientes…" />
        ) : falhou ? (
          <Erro
            titulo="Não foi possível carregar os clientes"
            mensagem="Confira a conexão e tente de novo."
            acao={
              <Botao variante="secundaria" onClick={() => void carregar()}>
                Tentar de novo
              </Botao>
            }
          />
        ) : pagina !== null && pagina.clientes.length === 0 ? (
          pagina.todos === 0 ? (
            <Vazio
              titulo="Nenhum cliente ainda"
              descricao="Quem comprar pelo site aparece aqui sozinho. Quem liga ou compra no balcão, você cadastra."
              acao={
                <Botao onClick={() => setCadastrando(true)}>
                  Cadastrar o primeiro cliente
                </Botao>
              }
            />
          ) : (
            <Vazio
              titulo="Nada encontrado"
              descricao="Nenhum cliente combina com a busca e os filtros escolhidos. Confira o nome, tente só uma parte do telefone ou limpe os filtros."
              acao={
                <Botao variante="secundaria" onClick={() => mudar(LIMPO)}>
                  Limpar filtros
                </Botao>
              }
            />
          )
        ) : pagina !== null ? (
          <div
            aria-busy={carregando || undefined}
            className={carregando ? "opacity-60 transition-opacity" : ""}
          >
            <Tabela
              legenda="Clientes"
              legendaEscondida
              colunas={COLUNAS}
              linhas={pagina.clientes}
              chaveDaLinha={(cliente) => cliente.id}
              noCelular="cartoes"
            />
          </div>
        ) : null}
        {pagina !== null && !falhou ? (
          <Paginacao
            paginacao={pagina}
            item="clientes"
            aoIr={(numero) => {
              mudar({ pagina: String(numero) });
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        ) : null}
      </div>
    </section>
  );
}
