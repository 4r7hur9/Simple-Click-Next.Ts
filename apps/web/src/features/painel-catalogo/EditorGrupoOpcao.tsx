"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { centavosDoTexto } from "../../lib/dinheiro.ts";
import { Seletor } from "@simpleclick/ui";

import { ROTULO_DO_TIPO_DE_GRUPO } from "../painel-estoque/visao-do-catalogo.ts";
import { EXPLICACOES } from "./explicacoes.ts";
import {
  RotuloComInfo,
  TituloComInfo,
  descritoDoInfo,
} from "./RotuloComInfo.tsx";

interface Opcao {
  readonly id: string;
  readonly nome: string;
  readonly acrescimoCentavos: number;
  readonly disponivel: boolean;
  readonly padrao: boolean;
}

interface Grupo {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string | null;
  readonly tipo: string;
  readonly minimo: number;
  readonly maximo: number | null;
  readonly permiteRepetir: boolean;
  readonly eixoDeVariacao: boolean;
  readonly ativo: boolean;
  readonly opcoes: Opcao[];
}

interface Props {
  readonly produtoId: string;
}

const GRUPO_VAZIO = {
  nome: "",
  descricao: "",
  tipo: "ADDON",
  minimo: "0",
  maximo: "",
  permiteRepetir: false,
  eixoDeVariacao: false,
  ativo: true,
};
// Acréscimo vazio por padrão (card #67): vazio = não muda o preço. O "0"
// pré-preenchido parecia um valor de verdade e ninguém entendia o campo.
const OPCAO_VAZIA = {
  nome: "",
  acrescimo: "",
  codigoExterno: "",
  disponivel: true,
  padrao: false,
};

function dinheiro(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function EditorGrupoOpcao({ produtoId }: Props) {
  const base = useId();
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [grupo, setGrupo] = useState(GRUPO_VAZIO);
  const [opcoes, setOpcoes] = useState<Record<string, typeof OPCAO_VAZIA>>({});
  const [mensagem, setMensagem] = useState("Carregando grupos…");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    try {
      const resposta = await fetch(
        `/api/catalogo/produtos/${produtoId}/opcoes`,
        { cache: "no-store" },
      );
      if (!resposta.ok) throw new Error();
      const dados = (await resposta.json()) as { grupos: Grupo[] };
      setGrupos(dados.grupos);
      setMensagem(
        dados.grupos.length === 0
          ? "Crie o primeiro grupo de escolhas."
          : `${dados.grupos.length} grupo(s) cadastrado(s).`,
      );
    } catch {
      setMensagem("Não foi possível carregar os grupos.");
    }
  }

  useEffect(() => {
    void carregar();
  }, [produtoId]);

  async function criarGrupo(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    const minimo = Number(grupo.minimo);
    const maximo = grupo.maximo === "" ? null : Number(grupo.maximo);
    try {
      const resposta = await fetch(
        `/api/catalogo/produtos/${produtoId}/opcoes`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            nome: grupo.nome,
            descricao: grupo.descricao.trim() || null,
            tipo:
              grupo.tipo === "INGREDIENT"
                ? "INGREDIENT"
                : grupo.eixoDeVariacao
                  ? "VARIATION"
                  : "ADDON",
            minimo,
            maximo,
            permiteRepetir: grupo.permiteRepetir,
            eixoDeVariacao: grupo.eixoDeVariacao || grupo.tipo === "VARIATION",
            ativo: grupo.ativo,
          }),
        },
      );
      if (!resposta.ok) throw new Error();
      setGrupo(GRUPO_VAZIO);
      await carregar();
    } catch {
      setMensagem("Não foi possível criar. Confira mínimo e máximo.");
    } finally {
      setSalvando(false);
    }
  }

  async function criarOpcao(
    evento: React.FormEvent<HTMLFormElement>,
    grupo: Grupo,
  ) {
    evento.preventDefault();
    const grupoId = grupo.id;
    const formulario = opcoes[grupoId] ?? OPCAO_VAZIA;
    // Centavos lidos como texto (AC-311): "2.50" é R$ 2,50, e não R$ 250.
    // Vazio é "sem acréscimo"; no eixo de variação o preço mora na variação.
    const acrescimo = formulario.acrescimo.trim();
    const acrescimoCentavos =
      grupo.eixoDeVariacao || acrescimo === "" ? 0 : centavosDoTexto(acrescimo);
    if (acrescimoCentavos === null) {
      setMensagem("Acréscimo inválido. Escreva em reais, como 2,50.");
      return;
    }
    setSalvando(true);
    try {
      const resposta = await fetch(
        `/api/catalogo/produtos/${produtoId}/opcoes/${grupoId}/itens`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            nome: formulario.nome,
            acrescimoCentavos,
            disponivel: formulario.disponivel,
            padrao: grupo.eixoDeVariacao ? false : formulario.padrao,
            codigoExterno: formulario.codigoExterno.trim() || null,
          }),
        },
      );
      if (!resposta.ok) throw new Error();
      setOpcoes((anteriores) => ({ ...anteriores, [grupoId]: OPCAO_VAZIA }));
      await carregar();
    } catch {
      setMensagem("Não foi possível adicionar a opção.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarOpcao(grupoId: string, opcao: Opcao) {
    const resposta = await fetch(
      `/api/catalogo/produtos/${produtoId}/opcoes/${grupoId}/itens/${opcao.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ disponivel: !opcao.disponivel }),
      },
    );
    if (resposta.ok) await carregar();
    else setMensagem("Não foi possível alterar a disponibilidade.");
  }

  async function removerOpcao(grupoId: string, opcao: Opcao) {
    if (!window.confirm(`Remover ${opcao.nome}?`)) return;
    const resposta = await fetch(
      `/api/catalogo/produtos/${produtoId}/opcoes/${grupoId}/itens/${opcao.id}`,
      { method: "DELETE" },
    );
    if (resposta.ok) await carregar();
    else setMensagem("Não foi possível remover a opção.");
  }

  function mudarOpcao(grupoId: string, mudanca: Partial<typeof OPCAO_VAZIA>) {
    setOpcoes((anteriores) => ({
      ...anteriores,
      [grupoId]: { ...(anteriores[grupoId] ?? OPCAO_VAZIA), ...mudanca },
    }));
  }

  const idNome = `${base}-grupo-nome`;
  const idTipo = `${base}-grupo-tipo`;
  const idMinimo = `${base}-grupo-minimo`;
  const idMaximo = `${base}-grupo-maximo`;
  const idRepetir = `${base}-grupo-repetir`;
  const idEixo = `${base}-grupo-eixo`;

  return (
    <section
      className="mt-8 max-w-4xl rounded-[var(--raio-cartao)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)] shadow-[var(--sombra-larga)] p-6 sm:p-8"
      aria-labelledby="grupos-de-escolha"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="grupos-de-escolha" className="text-2xl font-semibold">
            Escolhas e adicionais
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--cor-tinta-suave)]">
            O mínimo define se o grupo é obrigatório. Opções esgotadas continuam
            visíveis sem bloquear o produto.
          </p>
        </div>
        <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
          {mensagem}
        </p>
      </div>
      <div className="mt-6 space-y-5">
        {grupos.map((item) => {
          const formulario = opcoes[item.id] ?? OPCAO_VAZIA;
          const eixo = item.eixoDeVariacao;
          const idOpcaoNome = `${base}-${item.id}-nome`;
          const idOpcaoAcrescimo = `${base}-${item.id}-acrescimo`;
          const idOpcaoCodigo = `${base}-${item.id}-codigo`;
          const idOpcaoPadrao = `${base}-${item.id}-padrao`;
          return (
            <article
              key={item.id}
              className="rounded-[var(--raio-botao)] border border-[var(--cor-borda)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold">{item.nome}</h3>
                  <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
                    {item.minimo > 0
                      ? `Obrigatório: escolher ao menos ${item.minimo}`
                      : "Opcional"}{" "}
                    ·{" "}
                    {item.maximo === null
                      ? "sem máximo"
                      : `no máximo ${item.maximo}`}{" "}
                    ·{" "}
                    {item.permiteRepetir
                      ? "pode repetir a mesma opção"
                      : "sem repetir a opção"}
                    {eixo ? " · eixo da grade de variações" : ""}
                  </p>
                </div>
                <span className="sc-selo sc-selo--neutro">
                  {ROTULO_DO_TIPO_DE_GRUPO[item.tipo] ?? "Grupo"}
                </span>
              </div>
              {eixo ? (
                <p className="mt-4 rounded-[var(--raio-botao)] bg-[var(--cor-papel)] p-3 text-sm leading-6">
                  O preço e o estoque de cada opção ficam em{" "}
                  <Link
                    className="font-semibold text-[var(--cor-primaria-texto)] underline"
                    href={`/painel/produtos/${produtoId}/variacoes`}
                  >
                    Variações
                  </Link>
                  .
                </p>
              ) : null}
              {item.opcoes.length > 0 ? (
                <TituloComInfo
                  className="mt-4"
                  nome="Esgotar e remover opções"
                  info={EXPLICACOES.esgotarOpcao}
                >
                  Opções deste grupo
                </TituloComInfo>
              ) : null}
              <ul className="mt-2 space-y-2">
                {item.opcoes.map((opcao) => (
                  <li
                    key={opcao.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg bg-[var(--cor-papel)] p-3"
                  >
                    <span className="flex-1 font-medium">
                      {opcao.nome}{" "}
                      <span className="text-sm text-[var(--cor-tinta-suave)]">
                        {eixo || opcao.acrescimoCentavos === 0
                          ? ""
                          : `· ${opcao.acrescimoCentavos > 0 ? "+" : "−"} ${dinheiro(Math.abs(opcao.acrescimoCentavos))} `}
                        · {opcao.disponivel ? "disponível" : "esgotada"}
                        {opcao.padrao ? " · já vem marcada" : ""}
                      </span>
                    </span>
                    <button
                      className="sc-botao sc-botao--secundaria text-xs"
                      type="button"
                      onClick={() => void alternarOpcao(item.id, opcao)}
                    >
                      {opcao.disponivel ? "Esgotar" : "Reativar"}
                    </button>
                    <button
                      className="sc-botao sc-botao--secundaria text-xs"
                      type="button"
                      onClick={() => void removerOpcao(item.id, opcao)}
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
              <form
                onSubmit={(evento) => void criarOpcao(evento, item)}
                className="mt-4 grid gap-4 border-t border-[var(--cor-borda)] pt-4"
              >
                <h4 className="text-sm font-semibold">Nova opção</h4>
                <div
                  className={
                    eixo
                      ? "grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-end"
                      : "grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem_14rem] sm:items-end"
                  }
                >
                  <div className="grid gap-2">
                    <RotuloComInfo htmlFor={idOpcaoNome}>
                      Nome da opção
                    </RotuloComInfo>
                    <input
                      id={idOpcaoNome}
                      className="sc-campo__controle w-full"
                      value={formulario.nome}
                      onChange={(evento) =>
                        mudarOpcao(item.id, { nome: evento.target.value })
                      }
                      placeholder={eixo ? "Ex.: Grande" : "Ex.: Borda recheada"}
                      maxLength={120}
                      required
                    />
                  </div>
                  {eixo ? null : (
                    <div className="grid gap-2">
                      <RotuloComInfo
                        htmlFor={idOpcaoAcrescimo}
                        nome="Acréscimo no preço"
                        info={EXPLICACOES.acrescimoDaOpcao}
                      >
                        Acréscimo no preço (R$)
                      </RotuloComInfo>
                      <input
                        id={idOpcaoAcrescimo}
                        className="sc-campo__controle w-full"
                        inputMode="decimal"
                        value={formulario.acrescimo}
                        aria-describedby={descritoDoInfo(
                          idOpcaoAcrescimo,
                          EXPLICACOES.acrescimoDaOpcao,
                        )}
                        onChange={(evento) =>
                          mudarOpcao(item.id, {
                            acrescimo: evento.target.value,
                          })
                        }
                        placeholder="Vazio = sem acréscimo"
                      />
                    </div>
                  )}
                  <div className="grid gap-2">
                    <RotuloComInfo
                      htmlFor={idOpcaoCodigo}
                      nome="Código externo"
                      info={EXPLICACOES.codigoExterno}
                    >
                      Código externo (opcional)
                    </RotuloComInfo>
                    <input
                      id={idOpcaoCodigo}
                      className="sc-campo__controle w-full"
                      value={formulario.codigoExterno}
                      maxLength={100}
                      aria-describedby={descritoDoInfo(
                        idOpcaoCodigo,
                        EXPLICACOES.codigoExterno,
                      )}
                      onChange={(evento) =>
                        mudarOpcao(item.id, {
                          codigoExterno: evento.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {eixo ? (
                    <span />
                  ) : (
                    <span className="flex items-center gap-3 text-sm">
                      <input
                        id={idOpcaoPadrao}
                        className="h-5 w-5"
                        type="checkbox"
                        checked={formulario.padrao}
                        aria-describedby={descritoDoInfo(
                          idOpcaoPadrao,
                          EXPLICACOES.opcaoJaMarcada,
                        )}
                        onChange={(evento) =>
                          mudarOpcao(item.id, { padrao: evento.target.checked })
                        }
                      />
                      <RotuloComInfo
                        htmlFor={idOpcaoPadrao}
                        nome="Já vem marcada"
                        info={EXPLICACOES.opcaoJaMarcada}
                      >
                        Já vem marcada para o cliente
                      </RotuloComInfo>
                    </span>
                  )}
                  <button
                    className="sc-botao sc-botao--secundaria"
                    type="submit"
                    disabled={salvando}
                  >
                    Adicionar opção
                  </button>
                </div>
              </form>
            </article>
          );
        })}
      </div>
      <form
        onSubmit={(evento) => void criarGrupo(evento)}
        className="mt-6 grid gap-5 border-t border-[var(--cor-borda)] pt-6 sm:grid-cols-2"
      >
        <h3 className="sm:col-span-2 text-xl font-semibold">Novo grupo</h3>
        <div className="grid content-start gap-2">
          <RotuloComInfo htmlFor={idNome}>Nome do grupo</RotuloComInfo>
          <input
            id={idNome}
            className="sc-campo__controle w-full"
            value={grupo.nome}
            onChange={(evento) =>
              setGrupo((anterior) => ({
                ...anterior,
                nome: evento.target.value,
              }))
            }
            placeholder="Ex.: Borda, Adicionais, Tamanho"
            maxLength={120}
            required
          />
        </div>
        <div className="grid content-start gap-2">
          <RotuloComInfo
            htmlFor={idTipo}
            nome="Tipo do grupo"
            info={EXPLICACOES.tipoDoGrupo}
          >
            Tipo do grupo
          </RotuloComInfo>
          <Seletor
            id={idTipo}
            className="w-full"
            value={grupo.tipo}
            aria-describedby={descritoDoInfo(idTipo, EXPLICACOES.tipoDoGrupo)}
            onChange={(valor) =>
              setGrupo((anterior) => ({
                ...anterior,
                tipo: valor,
                eixoDeVariacao:
                  valor === "VARIATION" ||
                  (anterior.tipo === "VARIATION"
                    ? false
                    : anterior.eixoDeVariacao),
              }))
            }
          >
            <option value="ADDON">Adicional</option>
            <option value="INGREDIENT">Ingrediente</option>
            <option value="VARIATION">Variação (eixo da grade)</option>
          </Seletor>
        </div>
        <div className="grid content-start gap-2">
          <RotuloComInfo
            htmlFor={idMinimo}
            nome="Mínimo de escolhas"
            info={EXPLICACOES.minimoDoGrupo}
          >
            Mínimo de escolhas
          </RotuloComInfo>
          <input
            id={idMinimo}
            className="sc-campo__controle w-full"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={grupo.minimo}
            aria-describedby={descritoDoInfo(
              idMinimo,
              EXPLICACOES.minimoDoGrupo,
            )}
            onChange={(evento) =>
              setGrupo((anterior) => ({
                ...anterior,
                minimo: evento.target.value,
              }))
            }
          />
          <span className="text-xs text-[var(--cor-tinta-suave)]">
            {Number(grupo.minimo) > 0
              ? "Obrigatório: o cliente precisa escolher."
              : "0 = opcional."}
          </span>
        </div>
        <div className="grid content-start gap-2">
          <RotuloComInfo
            htmlFor={idMaximo}
            nome="Máximo de escolhas"
            info={EXPLICACOES.maximoDoGrupo}
          >
            Máximo de escolhas (opcional)
          </RotuloComInfo>
          <input
            id={idMaximo}
            className="sc-campo__controle w-full"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={grupo.maximo}
            placeholder="Vazio = sem limite"
            aria-describedby={descritoDoInfo(
              idMaximo,
              EXPLICACOES.maximoDoGrupo,
            )}
            onChange={(evento) =>
              setGrupo((anterior) => ({
                ...anterior,
                maximo: evento.target.value,
              }))
            }
          />
        </div>
        <span className="flex items-center gap-3 text-sm sm:col-span-2">
          <input
            id={idRepetir}
            className="h-5 w-5"
            type="checkbox"
            checked={grupo.permiteRepetir}
            aria-describedby={descritoDoInfo(
              idRepetir,
              EXPLICACOES.permiteRepetir,
            )}
            onChange={(evento) =>
              setGrupo((anterior) => ({
                ...anterior,
                permiteRepetir: evento.target.checked,
              }))
            }
          />
          <RotuloComInfo
            htmlFor={idRepetir}
            nome="Permitir repetir"
            info={EXPLICACOES.permiteRepetir}
          >
            Permitir repetir a mesma opção
          </RotuloComInfo>
        </span>
        <span className="flex items-center gap-3 text-sm sm:col-span-2">
          <input
            id={idEixo}
            className="h-5 w-5"
            type="checkbox"
            checked={grupo.eixoDeVariacao}
            aria-describedby={descritoDoInfo(
              idEixo,
              EXPLICACOES.eixoDeVariacao,
            )}
            onChange={(evento) =>
              setGrupo((anterior) => ({
                ...anterior,
                eixoDeVariacao: evento.target.checked,
                tipo: evento.target.checked ? "VARIATION" : "ADDON",
              }))
            }
          />
          <RotuloComInfo
            htmlFor={idEixo}
            nome="Eixo da grade de variações"
            info={EXPLICACOES.eixoDeVariacao}
          >
            Usar este grupo como eixo da grade de variações
          </RotuloComInfo>
        </span>
        <button
          className="sc-botao sc-botao--primaria w-fit"
          type="submit"
          disabled={salvando}
        >
          Criar grupo
        </button>
      </form>
    </section>
  );
}
