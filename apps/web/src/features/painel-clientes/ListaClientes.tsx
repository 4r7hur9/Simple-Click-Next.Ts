"use client";

/**
 * A lista de clientes da loja (AC-700, AC-701).
 *
 * O QUE O DONO PRECISA PARA ATENDER, E SÓ ISSO: nome, telefone, quantos
 * pedidos, quanto gastou e quando comprou por último. É por esta tela que ele
 * descobre quem sumiu — e por isso a ordem é a do último pedido.
 *
 * QUATRO ESTADOS, todos desenhados: carregando, erro com "tentar de novo",
 * vazio (com a diferença entre "ainda não há clientes" e "a busca não achou")
 * e a lista. A busca vai ao servidor, que compara telefone por dígitos: o dono
 * digita como quiser.
 */
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Botao, Carregando, Erro, Vazio } from "@simpleclick/ui";

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
import { FormularioCliente } from "./FormularioCliente.tsx";

type Estado =
  | { readonly tipo: "carregando" }
  | { readonly tipo: "erro" }
  | { readonly tipo: "ok"; readonly clientes: readonly ClienteDaLista[] };

export interface ListaClientesProps {
  /** A rede. A prova troca por uma que responde sem servidor. */
  readonly buscar?: Buscar | undefined;
  /** Para onde ir depois do cadastro. Padrão: a ficha do cliente novo. */
  readonly aoCadastrar?: ((ficha: FichaDoCliente) => void) | undefined;
}

function LinhaDoCliente({ cliente }: { readonly cliente: ClienteDaLista }) {
  return (
    <li
      className="rounded-[var(--raio-grande)] border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-4 shadow-[var(--sombra-baixa)]"
      data-cliente={cliente.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            className="text-lg font-semibold text-[var(--cor-primaria)] underline-offset-4 hover:underline"
            href={`/painel/clientes/${cliente.id}`}
          >
            {cliente.nome}
          </Link>
          <p className="text-sm text-[var(--cor-tinta-suave)]">
            {escreverTelefone(cliente.telefone)}
            {cliente.temConta ? (
              <span className="ml-2 rounded-full bg-[var(--cor-papel)] px-2 py-0.5 text-xs font-medium">
                Tem conta
              </span>
            ) : null}
          </p>
        </div>
        <strong aria-label="Total gasto">
          {escreverDinheiro(cliente.totalGastoCentavos)}
        </strong>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-[var(--cor-tinta-suave)]">Pedidos</dt>
          <dd className="font-medium">{cliente.totalDePedidos}</dd>
        </div>
        <div>
          <dt className="text-[var(--cor-tinta-suave)]">Último pedido</dt>
          <dd className="font-medium">
            {cliente.ultimoPedidoEm === null
              ? "Nunca pediu"
              : escreverData(cliente.ultimoPedidoEm)}
          </dd>
        </div>
      </dl>
    </li>
  );
}

export function ListaClientes({
  buscar = fetch,
  aoCadastrar,
}: ListaClientesProps) {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [termo, setTermo] = useState("");
  const [buscado, setBuscado] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
  const pedido = useRef(0);

  const carregar = useCallback(
    async (busca: string) => {
      // Só a resposta do ÚLTIMO pedido vale: a busca digitada rápido não pode
      // ser sobrescrita pela resposta atrasada da anterior.
      const este = ++pedido.current;
      setEstado({ tipo: "carregando" });
      const leitura = await buscarClientes(busca, buscar);
      if (este !== pedido.current) return;
      setBuscado(busca.trim());
      setEstado(
        leitura.estado === "ok"
          ? { tipo: "ok", clientes: leitura.clientes }
          : { tipo: "erro" },
      );
    },
    [buscar],
  );

  useEffect(() => {
    void carregar("");
  }, [carregar]);

  function aoBuscar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    void carregar(termo);
  }

  function depoisDoCadastro(ficha: FichaDoCliente) {
    setCadastrando(false);
    if (aoCadastrar) aoCadastrar(ficha);
    else window.location.assign(`/painel/clientes/${ficha.id}`);
  }

  return (
    <section aria-labelledby="titulo-clientes">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="sr-only" id="titulo-clientes">
          Clientes da loja
        </h2>
        <form
          role="search"
          aria-label="Buscar clientes"
          className="flex w-full max-w-xl gap-2"
          onSubmit={aoBuscar}
        >
          <label className="sr-only" htmlFor="busca-de-clientes">
            Buscar por nome ou telefone
          </label>
          <input
            id="busca-de-clientes"
            className="sc-campo__controle min-h-12 flex-1"
            type="search"
            inputMode="search"
            placeholder="Nome ou telefone"
            value={termo}
            onChange={(evento) => setTermo(evento.target.value)}
          />
          <Botao type="submit" variante="secundaria">
            Buscar
          </Botao>
        </form>
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

      <div className="mt-8" aria-live="polite">
        {estado.tipo === "carregando" ? (
          <Carregando rotulo="Carregando clientes…" />
        ) : estado.tipo === "erro" ? (
          <Erro
            titulo="Não foi possível carregar os clientes"
            mensagem="Confira a conexão e tente de novo."
            acao={
              <Botao
                variante="secundaria"
                onClick={() => void carregar(buscado)}
              >
                Tentar de novo
              </Botao>
            }
          />
        ) : estado.clientes.length === 0 ? (
          buscado === "" ? (
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
              titulo={`Nenhum cliente encontrado para "${buscado}"`}
              descricao="Confira o nome ou tente só uma parte do telefone."
            />
          )
        ) : (
          <ul className="grid gap-3" aria-label="Clientes">
            {estado.clientes.map((cliente) => (
              <LinhaDoCliente key={cliente.id} cliente={cliente} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
