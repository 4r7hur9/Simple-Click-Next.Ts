"use client";

import type {
  ComentarioDaLoja,
  ContagemDeComentarios,
  SituacaoDoComentario,
} from "@simpleclick/contracts";
import { useEffect, useState } from "react";

import { avisarQueComentariosMudaram } from "./useComentariosPendentes.ts";
import {
  idDoInfo,
  InfoDoPainel,
  RotuloComInfo,
} from "../config/RotuloComInfo.tsx";

/**
 * Moderação dos comentários da loja (card #48), sobre o contrato do #47.
 *
 * O comentário do cliente nasce PENDENTE e só aparece para todos depois que
 * a loja aprova. Aqui a loja vê a fila, aprova, recusa ou apaga — um a um ou
 * vários de uma vez — e o dono liga "aprovar automaticamente".
 */

const ABAS: readonly {
  readonly situacao: SituacaoDoComentario;
  readonly rotulo: string;
  readonly chave: keyof ContagemDeComentarios;
  readonly vazio: string;
}[] = [
  {
    situacao: "PENDENTE",
    rotulo: "Pendentes",
    chave: "pendentes",
    vazio: "Nenhum comentário esperando você. Tudo em dia!",
  },
  {
    situacao: "APROVADO",
    rotulo: "Aprovados",
    chave: "aprovados",
    vazio: "Nenhum comentário aprovado ainda.",
  },
  {
    situacao: "RECUSADO",
    rotulo: "Recusados",
    chave: "recusados",
    vazio: "Nenhum comentário recusado.",
  },
];

const POR_PAGINA = 20;

type Acao = "aprovar" | "recusar" | "apagar";

const CONTAGEM_VAZIA: ContagemDeComentarios = {
  pendentes: 0,
  aprovados: 0,
  recusados: 0,
  denunciados: 0,
};

/** "hoje às 14:05", "ontem às 09:30", "12/10 às 18:00". */
export function quandoFoi(iso: string, agora: Date = new Date()): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  const hora = data.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dia = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const ontem = new Date(agora);
  ontem.setDate(agora.getDate() - 1);
  if (dia(data) === dia(agora)) return `hoje às ${hora}`;
  if (dia(data) === dia(ontem)) return `ontem às ${hora}`;
  const quando = data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    ...(data.getFullYear() === agora.getFullYear() ? {} : { year: "numeric" }),
  });
  return `${quando} às ${hora}`;
}

/** As ações que fazem sentido em cada aba. */
function acoesDa(situacao: SituacaoDoComentario): readonly Acao[] {
  if (situacao === "PENDENTE") return ["aprovar", "recusar", "apagar"];
  if (situacao === "APROVADO") return ["recusar", "apagar"];
  return ["aprovar", "apagar"];
}

const ROTULO_DA_ACAO: Record<Acao, string> = {
  aprovar: "Aprovar",
  recusar: "Recusar",
  apagar: "Apagar",
};

export function TelaDeComentarios({
  podeConfigurar,
}: {
  /** O dono liga e desliga "aprovar automaticamente". */
  readonly podeConfigurar: boolean;
}) {
  const [situacao, setSituacao] = useState<SituacaoDoComentario>("PENDENTE");
  const [comentarios, setComentarios] = useState<ComentarioDaLoja[]>([]);
  const [contagem, setContagem] =
    useState<ContagemDeComentarios>(CONTAGEM_VAZIA);
  const [aprovarSozinho, setAprovarSozinho] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [ocupado, setOcupado] = useState(false);
  const [recusandoId, setRecusandoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [apagandoId, setApagandoId] = useState<string | null>(null);
  const [apagarEmLote, setApagarEmLote] = useState(false);
  const [gravandoConfig, setGravandoConfig] = useState(false);

  async function carregar(
    qual: SituacaoDoComentario,
    qualPagina: number = 1,
  ): Promise<void> {
    setCarregando(true);
    setErro(null);
    try {
      const consulta = new URLSearchParams({
        situacao: qual,
        pagina: String(qualPagina),
        porPagina: String(POR_PAGINA),
      });
      const resposta = await fetch(
        `/api/loja/comentarios?${consulta.toString()}`,
        { cache: "no-store" },
      );
      if (!resposta.ok) throw new Error();
      const dados = (await resposta.json()) as {
        comentarios: ComentarioDaLoja[];
        contagem: ContagemDeComentarios;
        aprovarAutomaticamente: boolean;
        total: number;
      };
      const lista =
        qualPagina === 1
          ? dados.comentarios
          : [
              ...comentarios,
              ...dados.comentarios.filter(
                (novo) => !comentarios.some((velho) => velho.id === novo.id),
              ),
            ];
      setComentarios(lista);
      setContagem(dados.contagem);
      setAprovarSozinho(dados.aprovarAutomaticamente);
      setTotal(dados.total);
      setPagina(qualPagina);
      setSelecionados(
        (antes) =>
          new Set(
            lista
              .map((comentario) => comentario.id)
              .filter((id) => antes.has(id)),
          ),
      );
    } catch {
      setErro("Não foi possível carregar os comentários agora.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    setSelecionados(new Set());
    setRecusandoId(null);
    setApagandoId(null);
    setApagarEmLote(false);
    void carregar(situacao);
  }, [situacao]);

  async function executar(
    acao: Acao,
    ids: readonly string[],
    motivoDaRecusa?: string,
  ): Promise<number> {
    let feitos = 0;
    for (const id of ids) {
      const endereco =
        acao === "apagar"
          ? `/api/loja/comentarios/${id}`
          : `/api/loja/comentarios/${id}/${acao}`;
      const corpo =
        acao === "recusar" &&
        motivoDaRecusa !== undefined &&
        motivoDaRecusa !== ""
          ? JSON.stringify({ motivo: motivoDaRecusa })
          : acao === "apagar"
            ? undefined
            : "{}";
      const resposta = await fetch(endereco, {
        method: acao === "apagar" ? "DELETE" : "POST",
        ...(corpo === undefined
          ? {}
          : { headers: { "content-type": "application/json" }, body: corpo }),
      }).catch(() => null);
      if (resposta?.ok) feitos += 1;
    }
    return feitos;
  }

  async function agir(
    acao: Acao,
    ids: readonly string[],
    motivoDaRecusa?: string,
  ) {
    if (ids.length === 0) return;
    setOcupado(true);
    setMensagem(null);
    const feitos = await executar(acao, ids, motivoDaRecusa?.trim());
    const verbo =
      acao === "aprovar"
        ? "aprovado"
        : acao === "recusar"
          ? "recusado"
          : "apagado";
    const falhas = ids.length - feitos;
    setMensagem(
      feitos === 0
        ? "Não foi possível concluir. Tente de novo."
        : `${feitos === 1 ? `1 comentário ${verbo}` : `${feitos} comentários ${verbo}s`}${
            falhas > 0 ? `; ${falhas} não deu certo.` : "."
          }`,
    );
    setRecusandoId(null);
    setApagandoId(null);
    setApagarEmLote(false);
    setMotivo("");
    setSelecionados(new Set());
    await carregar(situacao);
    avisarQueComentariosMudaram();
    setOcupado(false);
  }

  async function mudarAprovacaoAutomatica(ligar: boolean) {
    setGravandoConfig(true);
    setMensagem(null);
    const resposta = await fetch("/api/loja/comentarios/configuracao", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ aprovarAutomaticamente: ligar }),
    }).catch(() => null);
    if (resposta?.ok) {
      setAprovarSozinho(ligar);
      setMensagem(
        ligar
          ? "Pronto: os próximos comentários entram no ar sem esperar você."
          : "Pronto: os próximos comentários esperam a sua aprovação.",
      );
    } else {
      setMensagem("Não foi possível mudar a aprovação automática.");
    }
    setGravandoConfig(false);
  }

  function alternar(id: string) {
    setSelecionados((antes) => {
      const novo = new Set(antes);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  const acoes = acoesDa(situacao);
  const todosMarcados =
    comentarios.length > 0 &&
    comentarios.every((comentario) => selecionados.has(comentario.id));
  const ids = [...selecionados];
  const aba = ABAS.find((candidata) => candidata.situacao === situacao);

  return (
    <div className="mt-8 grid gap-6">
      <section
        aria-labelledby="aprovacao-automatica"
        className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--raio-cartao)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)] p-5"
      >
        <div className="max-w-xl">
          <div className="flex items-center gap-1.5">
            <h2 id="aprovacao-automatica" className="font-semibold">
              Aprovar automaticamente
            </h2>
            <InfoDoPainel
              explicacao="aprovarAutomaticamente"
              nome="Aprovar automaticamente"
            />
          </div>
          <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
            {aprovarSozinho
              ? "Ligado: os comentários novos aparecem na hora, sem passar pela fila. Você ainda pode recusar ou apagar depois."
              : "Desligado: cada comentário novo espera a sua aprovação antes de aparecer para os clientes."}
          </p>
        </div>
        {podeConfigurar ? (
          <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
            <input
              className="h-5 w-5"
              type="checkbox"
              role="switch"
              checked={aprovarSozinho}
              disabled={gravandoConfig}
              onChange={(evento) =>
                void mudarAprovacaoAutomatica(evento.target.checked)
              }
            />
            {aprovarSozinho ? "Ligado" : "Desligado"}
          </label>
        ) : (
          <span className="sc-selo sc-selo--neutro">
            {aprovarSozinho ? "Ligado" : "Desligado"} · só o dono muda
          </span>
        )}
      </section>

      <div
        role="tablist"
        aria-label="Situação dos comentários"
        className="flex flex-wrap gap-2 border-b border-[var(--cor-borda)]"
      >
        {ABAS.map((item) => {
          const ativa = item.situacao === situacao;
          return (
            <button
              key={item.situacao}
              type="button"
              role="tab"
              aria-selected={ativa}
              className={`-mb-px flex items-center gap-2 rounded-none border-0 border-b-2 bg-transparent px-3 py-2 text-sm font-semibold ${
                ativa
                  ? "border-[var(--cor-primaria)] text-[var(--cor-tinta)]"
                  : "border-transparent text-[var(--cor-tinta-suave)]"
              }`}
              onClick={() => setSituacao(item.situacao)}
            >
              {item.rotulo}
              <span
                className={`sc-selo ${
                  item.situacao === "PENDENTE" && contagem.pendentes > 0
                    ? "sc-selo--atencao"
                    : "sc-selo--neutro"
                }`}
              >
                {contagem[item.chave]}
              </span>
            </button>
          );
        })}
      </div>

      {mensagem !== null ? (
        <p className="text-sm" role="status">
          {mensagem}
        </p>
      ) : null}

      {comentarios.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--raio-botao)] border border-[var(--cor-borda)] px-4 py-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              className="h-5 w-5"
              type="checkbox"
              checked={todosMarcados}
              onChange={() =>
                setSelecionados(
                  todosMarcados
                    ? new Set()
                    : new Set(comentarios.map((comentario) => comentario.id)),
                )
              }
            />
            Selecionar todos
          </label>
          <span className="text-sm text-[var(--cor-tinta-suave)]">
            {ids.length === 0
              ? "Nenhum selecionado"
              : `${ids.length} selecionado${ids.length === 1 ? "" : "s"}`}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            {apagarEmLote ? (
              <>
                <button
                  className="sc-botao sc-botao--perigo sc-botao--pequeno"
                  type="button"
                  disabled={ocupado}
                  onClick={() => void agir("apagar", ids)}
                >
                  Apagar {ids.length} de vez
                </button>
                <button
                  className="sc-botao sc-botao--discreta sc-botao--pequeno"
                  type="button"
                  onClick={() => setApagarEmLote(false)}
                >
                  Manter
                </button>
              </>
            ) : (
              acoes.map((acao) => (
                <button
                  key={acao}
                  className={`sc-botao sc-botao--pequeno ${
                    acao === "aprovar"
                      ? "sc-botao--primaria"
                      : "sc-botao--secundaria"
                  }`}
                  type="button"
                  disabled={ocupado || ids.length === 0}
                  onClick={() =>
                    acao === "apagar"
                      ? setApagarEmLote(true)
                      : void agir(acao, ids)
                  }
                >
                  {ROTULO_DA_ACAO[acao]} selecionados
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}

      {erro !== null ? (
        <p role="alert" className="text-sm">
          {erro}
        </p>
      ) : carregando && comentarios.length === 0 ? (
        <p className="text-sm text-[var(--cor-tinta-suave)]">Carregando…</p>
      ) : comentarios.length === 0 ? (
        <div className="rounded-[var(--raio-cartao)] border border-dashed border-[var(--cor-borda)] p-10 text-center">
          <p className="font-medium">{aba?.vazio}</p>
          {situacao === "PENDENTE" ? (
            <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
              Quando um cliente comentar um produto ou a loja em Explorar, o
              comentário aparece aqui para você aprovar.
            </p>
          ) : null}
        </div>
      ) : (
        <ul
          className="grid gap-3"
          aria-label={`Comentários ${aba?.rotulo.toLowerCase() ?? ""}`}
        >
          {comentarios.map((comentario) => (
            <li
              key={comentario.id}
              data-comentario={comentario.id}
              className={`grid gap-3 rounded-[var(--raio-cartao)] border bg-[var(--cor-superficie-alta)] p-4 sm:grid-cols-[auto_1fr] ${
                selecionados.has(comentario.id)
                  ? "border-[var(--cor-primaria)]"
                  : "border-[var(--cor-borda)]"
              }`}
            >
              <input
                className="mt-1 h-5 w-5"
                type="checkbox"
                aria-label={`Selecionar o comentário de ${comentario.autor.nome}`}
                checked={selecionados.has(comentario.id)}
                onChange={() => alternar(comentario.id)}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--cor-primaria-suave)] text-xs font-semibold"
                  >
                    {comentario.autor.iniciais}
                  </span>
                  <span className="font-semibold">{comentario.autor.nome}</span>
                  {comentario.autor.bloqueado ? (
                    <span className="sc-selo sc-selo--erro">Bloqueado</span>
                  ) : null}
                  {comentario.denuncias > 0 ? (
                    <span className="sc-selo sc-selo--atencao">
                      {comentario.denuncias === 1
                        ? "1 denúncia"
                        : `${comentario.denuncias} denúncias`}
                    </span>
                  ) : null}
                  <span className="text-sm text-[var(--cor-tinta-suave)]">
                    {quandoFoi(comentario.criadoEm)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
                  {comentario.alvo.tipo === "produto" &&
                  comentario.alvo.produtoId !== null ? (
                    <>
                      No produto{" "}
                      <a
                        className="font-semibold text-[var(--cor-primaria-texto)]"
                        href={`/painel/produtos/${comentario.alvo.produtoId}`}
                      >
                        {comentario.alvo.produtoNome ?? "sem nome"}
                      </a>
                    </>
                  ) : (
                    "Na página da loja"
                  )}
                </p>
                <p className="mt-3 whitespace-pre-line break-words leading-7">
                  {comentario.texto}
                </p>
                {comentario.situacao === "RECUSADO" &&
                comentario.motivoDaRecusa !== null ? (
                  <p className="mt-2 text-sm text-[var(--cor-tinta-suave)]">
                    Motivo da recusa: {comentario.motivoDaRecusa}
                  </p>
                ) : null}

                {recusandoId === comentario.id ? (
                  <div className="mt-3 grid gap-2">
                    <div className="text-sm">
                      <RotuloComInfo
                        para={`motivo-${comentario.id}`}
                        explicacao="motivoDaRecusa"
                        nome="Motivo da recusa"
                        className="font-medium"
                      >
                        Motivo (opcional, só a loja vê)
                      </RotuloComInfo>
                      <input
                        id={`motivo-${comentario.id}`}
                        aria-describedby={idDoInfo(`motivo-${comentario.id}`)}
                        className="sc-campo__controle mt-1 w-full"
                        maxLength={200}
                        value={motivo}
                        onChange={(evento) => setMotivo(evento.target.value)}
                        placeholder="Ex.: ofensivo, propaganda"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="sc-botao sc-botao--perigo sc-botao--pequeno"
                        type="button"
                        disabled={ocupado}
                        onClick={() =>
                          void agir("recusar", [comentario.id], motivo)
                        }
                      >
                        Confirmar recusa
                      </button>
                      <button
                        className="sc-botao sc-botao--discreta sc-botao--pequeno"
                        type="button"
                        onClick={() => setRecusandoId(null)}
                      >
                        Voltar
                      </button>
                    </div>
                  </div>
                ) : apagandoId === comentario.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm">Apagar de vez?</span>
                    <button
                      className="sc-botao sc-botao--perigo sc-botao--pequeno"
                      type="button"
                      disabled={ocupado}
                      onClick={() => void agir("apagar", [comentario.id])}
                    >
                      Apagar
                    </button>
                    <button
                      className="sc-botao sc-botao--discreta sc-botao--pequeno"
                      type="button"
                      onClick={() => setApagandoId(null)}
                    >
                      Manter
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {acoes.map((acao) => (
                      <button
                        key={acao}
                        className={`sc-botao sc-botao--pequeno ${
                          acao === "aprovar"
                            ? "sc-botao--primaria"
                            : acao === "apagar"
                              ? "sc-botao--discreta"
                              : "sc-botao--secundaria"
                        }`}
                        type="button"
                        disabled={ocupado}
                        onClick={() => {
                          if (acao === "aprovar") {
                            void agir("aprovar", [comentario.id]);
                          } else if (acao === "recusar") {
                            setMotivo("");
                            setApagandoId(null);
                            setRecusandoId(comentario.id);
                          } else {
                            setRecusandoId(null);
                            setApagandoId(comentario.id);
                          }
                        }}
                      >
                        {ROTULO_DA_ACAO[acao]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {comentarios.length < total ? (
        <button
          className="sc-botao sc-botao--secundaria w-fit"
          type="button"
          disabled={carregando}
          onClick={() => void carregar(situacao, pagina + 1)}
        >
          Mostrar mais
        </button>
      ) : null}
    </div>
  );
}
