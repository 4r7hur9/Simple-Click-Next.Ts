"use client";

/**
 * A ficha do cliente: dados, correção, remoção e histórico (AC-705, AC-711).
 *
 * REMOVER PEDE CONFIRMAÇÃO NA PRÓPRIA TELA, e não numa janela do navegador:
 * o botão vira a pergunta, com o que acontece dito com todas as letras — a
 * ficha sai das listas, os pedidos ficam. O dono decide sabendo.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Aviso,
  Botao,
  Carregando,
  Erro,
  IconeAdicionar,
  IconeConversa,
  IconeExcluir,
  IconeLocal,
  IconeVoltar,
  Info,
  Selo,
  Sucesso,
} from "@simpleclick/ui";

import {
  buscarFicha,
  corrigirCliente,
  escreverData,
  escreverTelefone,
  removerCliente,
  type Buscar,
  type FichaComHistorico,
  type FichaDoCliente,
} from "../../lib/clientes-do-painel.ts";
import { escreverDinheiro } from "../../lib/dinheiro.ts";
import { FormularioCliente } from "./FormularioCliente.tsx";
import { HistoricoCliente } from "./HistoricoCliente.tsx";

/**
 * De onde veio a ficha, em palavras do dono.
 *
 * Sem conta, a ficha nasce de duas formas: o dono cadastrou (ou montou um
 * pedido manual), ou a pessoa comprou pela vitrine sem criar conta. O banco
 * não guarda a origem da ficha; o que separa as duas é o canal dos pedidos:
 * algum pedido que não foi MANUAL só pode ter vindo da vitrine.
 */
export function origemDoCadastro(
  temConta: boolean,
  pedidos: readonly { readonly canal: string }[],
): string {
  if (temConta) return "Tem conta no SimpleClick";
  if (pedidos.some((pedido) => pedido.canal !== "MANUAL"))
    return "Comprou sem conta";
  return "Cadastrado pelo dono";
}

type Estado =
  | { readonly tipo: "carregando" }
  | { readonly tipo: "erro" }
  | { readonly tipo: "nao-encontrado" }
  | { readonly tipo: "removido" }
  | { readonly tipo: "ok"; readonly ficha: FichaComHistorico };

export interface FichaClienteProps {
  readonly clienteId: string;
  /** A rede. A prova troca por uma que responde sem servidor. */
  readonly buscar?: Buscar | undefined;
}

export function FichaCliente({ clienteId, buscar = fetch }: FichaClienteProps) {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [editando, setEditando] = useState(false);
  const [salvou, setSalvou] = useState(false);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [remocaoFalhou, setRemocaoFalhou] = useState(false);

  const carregar = useCallback(async () => {
    setEstado({ tipo: "carregando" });
    const leitura = await buscarFicha(clienteId, buscar);
    if (leitura.estado === "ok")
      setEstado({ tipo: "ok", ficha: leitura.ficha });
    else if (leitura.estado === "nao-encontrado") {
      setEstado({ tipo: "nao-encontrado" });
    } else setEstado({ tipo: "erro" });
  }, [buscar, clienteId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function depoisDaCorrecao(ficha: FichaDoCliente) {
    setEditando(false);
    setSalvou(true);
    setEstado((atual) =>
      atual.tipo === "ok"
        ? { tipo: "ok", ficha: { ...atual.ficha, cliente: ficha } }
        : atual,
    );
  }

  async function remover() {
    setRemovendo(true);
    setRemocaoFalhou(false);
    const removido = await removerCliente(clienteId, buscar);
    setRemovendo(false);
    if (removido) setEstado({ tipo: "removido" });
    else setRemocaoFalhou(true);
  }

  const voltar = (
    <Link
      className="sc-botao sc-botao--discreta sc-botao--pequeno sc-ficha__voltar"
      href="/painel/clientes"
    >
      <IconeVoltar aria-hidden="true" />
      Voltar para os clientes
    </Link>
  );

  if (estado.tipo === "carregando") {
    return (
      <div className="sc-pedidos sc-pedidos--respiro">
        <Carregando rotulo="Carregando ficha do cliente…" />
      </div>
    );
  }
  if (estado.tipo === "erro") {
    return (
      <div className="sc-pedidos sc-pedidos--respiro">
        <Erro
          titulo="Não foi possível abrir esta ficha"
          mensagem="Confira a conexão e tente de novo."
          acao={
            <Botao variante="secundaria" onClick={() => void carregar()}>
              Tentar de novo
            </Botao>
          }
        />
      </div>
    );
  }
  if (estado.tipo === "nao-encontrado") {
    return (
      <div className="sc-pedidos sc-pedidos--respiro">
        <Erro
          titulo="Cliente não encontrado"
          mensagem="Ele pode ter sido removido — ou não é cliente desta loja."
          acao={voltar}
        />
      </div>
    );
  }
  if (estado.tipo === "removido") {
    return (
      <div className="sc-pedidos sc-pedidos--respiro">
        <Sucesso
          titulo="Cliente removido das listas"
          descricao="Os pedidos dele continuam na loja, com os dados de cada compra."
          acao={voltar}
        />
      </div>
    );
  }

  const { cliente, pedidos } = estado.ficha;
  // Os números vêm do histórico que a ficha já carregou: pedido cancelado não
  // é compra, e por isso não entra na conta (a mesma régua da lista).
  const compras = pedidos.filter((pedido) => pedido.status !== "CANCELLED");
  const cancelados = pedidos.length - compras.length;
  const totalGasto = compras.reduce(
    (soma, pedido) => soma + pedido.totalCentavos,
    0,
  );
  const ticketMedio =
    compras.length > 0 ? Math.round(totalGasto / compras.length) : null;
  const ultimo = pedidos[0];
  const endereco = cliente.endereco;
  const whatsapp = linkDoWhatsApp(cliente.telefone);
  const origem = origemDoCadastro(cliente.temConta, pedidos);

  return (
    <div className="sc-pedidos sc-pedidos--respiro sc-ficha">
      {voltar}

      <header className="sc-ficha__cabeca">
        <span className="sc-ficha__avatar" aria-hidden="true">
          {iniciais(cliente.nome)}
        </span>
        <div className="sc-ficha__identidade">
          <p className="sc-pedidos__sobretitulo">Ficha do cliente</p>
          <h1 className="sc-ficha__nome">{cliente.nome}</h1>
          <ul className="sc-ficha__contatos" aria-label="Contato rápido">
            {cliente.telefone ? (
              <li>
                <a href={`tel:${cliente.telefone}`}>
                  {escreverTelefone(cliente.telefone)}
                </a>
              </li>
            ) : null}
            {whatsapp ? (
              <li>
                <a href={whatsapp} target="_blank" rel="noreferrer">
                  <IconeConversa aria-hidden="true" />
                  WhatsApp
                </a>
              </li>
            ) : null}
            {cliente.email ? (
              <li>
                <a href={`mailto:${cliente.email}`}>{cliente.email}</a>
              </li>
            ) : null}
            {cliente.temConta ? (
              <li>
                <Selo tom="sucesso">Tem conta no SimpleClick</Selo>
              </li>
            ) : null}
          </ul>
        </div>
        <div className="sc-ficha__acoes">
          {ultimo ? (
            <Link
              className="sc-botao sc-botao--secundaria"
              href={`/painel/pedidos/novo?cliente=${encodeURIComponent(cliente.id)}&repetir=${encodeURIComponent(ultimo.id)}`}
              data-repetir-ultimo={ultimo.id}
            >
              Repetir último pedido
            </Link>
          ) : null}
          <Link
            className="sc-botao sc-botao--primaria"
            href={`/painel/pedidos/novo?cliente=${encodeURIComponent(cliente.id)}`}
          >
            <IconeAdicionar aria-hidden="true" />
            Novo pedido
          </Link>
        </div>
      </header>

      <dl className="sc-ficha__resumo" data-resumo-do-cliente>
        <div>
          <dt>Total gasto</dt>
          <dd>{escreverDinheiro(totalGasto)}</dd>
          <dd className="sc-ficha__apoio">Sem contar cancelados</dd>
        </div>
        <div>
          <dt>Pedidos</dt>
          <dd>{compras.length}</dd>
          <dd className="sc-ficha__apoio">
            {cancelados > 0
              ? `${cancelados} ${cancelados === 1 ? "cancelado" : "cancelados"} fora da conta`
              : "Nenhum cancelado"}
          </dd>
        </div>
        <div>
          <dt className="inline-flex items-center gap-1">
            Ticket médio
            <Info
              rotulo="o ticket médio"
              conteudo={{
                texto:
                  "Quanto este cliente gasta, em média, em cada pedido: o total gasto dividido pelo número de pedidos, sem os cancelados.",
                exemplo: "4 pedidos somando R$ 160,00 dão R$ 40,00.",
              }}
            />
          </dt>
          <dd>{ticketMedio === null ? "—" : escreverDinheiro(ticketMedio)}</dd>
          <dd className="sc-ficha__apoio">Por pedido</dd>
        </div>
        <div>
          <dt>Último pedido</dt>
          <dd>{ultimo ? escreverData(ultimo.criadoEm) : "Nunca pediu"}</dd>
          <dd className="sc-ficha__apoio">
            Cliente desde {escreverData(cliente.criadoEm)}
          </dd>
        </div>
      </dl>

      {salvou ? <Aviso tom="sucesso">Ficha corrigida.</Aviso> : null}
      {remocaoFalhou ? (
        <Aviso tom="erro">Não foi possível remover agora. Tente de novo.</Aviso>
      ) : null}

      <div className="sc-ficha__grade">
        <div className="sc-ficha__lateral">
          <section
            aria-labelledby="contato-do-cliente"
            className="sc-ficha__cartao"
          >
            <div className="sc-ficha__cartao-topo">
              <h2 className="sc-ficha__titulo" id="contato-do-cliente">
                Contato
              </h2>
              <Botao
                variante="secundaria"
                tamanho="pequeno"
                onClick={() => setEditando((a) => !a)}
              >
                {editando ? "Fechar correção" : "Corrigir dados"}
              </Botao>
            </div>
            <dl className="sc-ficha__dados">
              <div>
                <dt>Telefone</dt>
                <dd>{escreverTelefone(cliente.telefone)}</dd>
              </div>
              <div>
                <dt>E-mail</dt>
                <dd>{cliente.email ?? "Não informado"}</dd>
              </div>
              <div>
                <dt className="inline-flex items-center gap-1">
                  Origem
                  <Info
                    rotulo="a origem do cliente"
                    conteudo={{
                      texto:
                        "Tem conta no SimpleClick: a pessoa criou login e acompanha os pedidos pela conta. Comprou sem conta: comprou pela sua vitrine sem criar login. Cadastrado pelo dono: você ou a equipe cadastrou aqui no painel, num pedido manual ou numa importação.",
                    }}
                  />
                </dt>
                <dd data-origem-do-cliente>{origem}</dd>
              </div>
              {cliente.observacao ? (
                <div>
                  <dt>Observação</dt>
                  <dd>{cliente.observacao}</dd>
                </div>
              ) : null}
            </dl>
            <div className="sc-ficha__rodape">
              {confirmandoRemocao ? (
                <div
                  className="sc-ficha__confirmar"
                  role="group"
                  aria-label="Confirmar remoção"
                >
                  <p>
                    Remover tira {cliente.nome} das listas. Os pedidos ficam.
                  </p>
                  <div className="sc-ficha__botoes">
                    <Botao
                      variante="perigo"
                      tamanho="pequeno"
                      carregando={removendo}
                      rotuloDeEspera="Removendo…"
                      onClick={() => void remover()}
                    >
                      Sim, remover
                    </Botao>
                    <Botao
                      variante="discreta"
                      tamanho="pequeno"
                      onClick={() => setConfirmandoRemocao(false)}
                    >
                      Não remover
                    </Botao>
                  </div>
                </div>
              ) : (
                <Botao
                  variante="discreta"
                  tamanho="pequeno"
                  icone={<IconeExcluir aria-hidden="true" />}
                  onClick={() => setConfirmandoRemocao(true)}
                >
                  Remover cliente
                </Botao>
              )}
            </div>
          </section>

          <section
            aria-labelledby="endereco-do-cliente"
            className="sc-ficha__cartao"
          >
            <div className="sc-ficha__cartao-topo">
              <h2 className="sc-ficha__titulo" id="endereco-do-cliente">
                Endereço
              </h2>
            </div>
            {endereco ? (
              <div className="sc-ficha__endereco">
                <IconeLocal aria-hidden="true" />
                <p>
                  {[
                    [endereco.logradouro, endereco.numero]
                      .filter(Boolean)
                      .join(", "),
                    endereco.complemento,
                    endereco.bairro,
                    [endereco.cidade, endereco.estado]
                      .filter(Boolean)
                      .join("/"),
                    endereco.cep,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {endereco.pontoDeReferencia ? (
                    <span className="sc-ficha__apoio">
                      Referência: {endereco.pontoDeReferencia}
                    </span>
                  ) : null}
                </p>
              </div>
            ) : (
              <div className="sc-ficha__vazio">
                <IconeLocal aria-hidden="true" />
                <p>Nenhum endereço anotado</p>
                <span className="sc-ficha__apoio">
                  Anote para lançar entregas sem perguntar de novo.
                </span>
                {editando ? null : (
                  <Botao
                    variante="secundaria"
                    tamanho="pequeno"
                    onClick={() => setEditando(true)}
                  >
                    Anotar endereço
                  </Botao>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="sc-ficha__principal">
          {editando ? (
            <FormularioCliente
              titulo="Corrigir dados do cliente"
              inicial={cliente}
              enviar={(dados) => corrigirCliente(cliente.id, dados, buscar)}
              aoSalvar={depoisDaCorrecao}
            />
          ) : null}
          <HistoricoCliente clienteId={cliente.id} pedidos={pedidos} />
        </div>
      </div>
    </div>
  );
}

/** As iniciais do avatar: a primeira e a última palavra do nome. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? "?";
  const ultima = partes.length > 1 ? (partes.at(-1)?.[0] ?? "") : "";
  return (primeira + ultima).toUpperCase();
}

/** O link do WhatsApp, só para número que dá para discar. */
function linkDoWhatsApp(telefone: string | null): string | null {
  if (telefone === null) return null;
  const digitos = telefone.replace(/[^0-9]/g, "");
  if (digitos.length === 10 || digitos.length === 11) {
    return `https://wa.me/55${digitos}`;
  }
  return digitos.length >= 12 ? `https://wa.me/${digitos}` : null;
}
