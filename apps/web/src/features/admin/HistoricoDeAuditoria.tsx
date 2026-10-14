"use client";

/**
 * Histórico de auditoria da plataforma (T-208, AC-215, AC-118, AC-922).
 *
 * Dois componentes, como a lista de lojas: `HistoricoDeAuditoria` guarda os
 * filtros e fala com a rede; `PainelDaAuditoria` só desenha o que recebe — e
 * é ele que a prova confere nos quatro estados (P-011). Cada ato é desenhado
 * pela mesma `ListaDaTrilha` da ficha da loja, com a loja a que pertence; o
 * ato sensível sai destacado por ela.
 *
 * O filtro por loja nasce do próprio histórico ("só desta loja") ou do
 * endereço (`?loja=`), que é como a ficha da loja chega aqui.
 */

import {
  esquemaDaPaginaDaAuditoria,
  ROTULOS_DOS_ATOS,
  type PaginaDaAuditoriaNoContrato,
  type RegistroDaAuditoriaNoContrato,
} from "@simpleclick/contracts";
import { Botao, Cartao, Carregando, Erro, Selo, Vazio } from "@simpleclick/ui";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { ListaDaTrilha } from "./ListaDaTrilha.tsx";

/** Os filtros como a tela os guarda: texto vazio é "sem filtro". */
export interface FiltrosDaAuditoria {
  readonly loja: string;
  readonly ato: string;
  readonly de: string;
  readonly ate: string;
}

export const SEM_FILTROS: FiltrosDaAuditoria = {
  loja: "",
  ato: "",
  de: "",
  ate: "",
};

export type EstadoDoHistorico =
  | { readonly fase: "carregando" }
  | { readonly fase: "erro"; readonly mensagem: string }
  | { readonly fase: "pronto"; readonly pagina: PaginaDaAuditoriaNoContrato };

export const MENSAGEM_DE_SESSAO =
  "Sua sessão não tem acesso à administração. Entre de novo.";
export const MENSAGEM_DE_FALHA =
  "Não foi possível carregar o histórico agora. Tente de novo em instantes.";
export const MENSAGEM_DE_PERIODO =
  "O fim do período vem depois do começo. Confira as datas.";

/** O endereço que a tela consulta no próprio site, só com o que foi filtrado. */
export function enderecoDoHistorico(
  filtros: FiltrosDaAuditoria,
  pagina: number,
): string {
  const parametros = new URLSearchParams({ pagina: String(pagina) });
  for (const chave of ["loja", "ato", "de", "ate"] as const) {
    const valor = filtros[chave].trim();
    if (valor !== "") parametros.set(chave, valor);
  }
  return `/api/admin/auditoria?${parametros.toString()}`;
}

/** O período está na ordem certa (ou incompleto, o que também vale)? */
export function periodoValido(filtros: FiltrosDaAuditoria): boolean {
  return filtros.de === "" || filtros.ate === "" || filtros.de <= filtros.ate;
}

/** Os atos que o filtro oferece, pelo nome que a administração usa. */
const OPCOES_DE_ATO = Object.entries(ROTULOS_DOS_ATOS).sort(([, a], [, b]) =>
  a.localeCompare(b, "pt-BR"),
);

export interface PainelDaAuditoriaProps {
  /** O rascunho dos filtros, como está no formulário. */
  readonly rascunho: FiltrosDaAuditoria;
  /** O nome da loja filtrada, quando se sabe; senão, o filtro aparece genérico. */
  readonly nomeDaLojaFiltrada: string | null;
  readonly estado: EstadoDoHistorico;
  readonly periodoInvalido: boolean;
  readonly aoMudar: (filtros: FiltrosDaAuditoria) => void;
  readonly aoFiltrar: (evento: FormEvent<HTMLFormElement>) => void;
  readonly aoLimpar: () => void;
  readonly aoFiltrarLoja: (registro: RegistroDaAuditoriaNoContrato) => void;
  readonly aoTirarLoja: () => void;
  readonly aoTentarDeNovo: () => void;
  readonly aoIrParaPagina: (pagina: number) => void;
}

/** Só desenha. Nenhuma chamada de rede mora aqui. */
export function PainelDaAuditoria(props: PainelDaAuditoriaProps) {
  const { rascunho, estado } = props;
  const algumFiltro =
    rascunho.loja !== "" ||
    rascunho.ato !== "" ||
    rascunho.de !== "" ||
    rascunho.ate !== "";

  return (
    <section aria-labelledby="historico-de-auditoria" className="mt-8">
      <Cartao titulo="Filtrar histórico" nivelDoTitulo={2}>
        <form
          aria-label="Filtros do histórico"
          onSubmit={props.aoFiltrar}
          className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
        >
          <label
            className="grid gap-1 text-sm font-medium"
            htmlFor="filtro-ato"
          >
            Ato
            <select
              id="filtro-ato"
              name="ato"
              className="sc-campo__controle"
              value={rascunho.ato}
              onChange={(evento) =>
                props.aoMudar({ ...rascunho, ato: evento.target.value })
              }
            >
              <option value="">Todos os atos</option>
              {OPCOES_DE_ATO.map(([codigo, rotulo]) => (
                <option key={codigo} value={codigo}>
                  {rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium" htmlFor="filtro-de">
            De
            <input
              id="filtro-de"
              name="de"
              type="date"
              className="sc-campo__controle"
              value={rascunho.de}
              onChange={(evento) =>
                props.aoMudar({ ...rascunho, de: evento.target.value })
              }
            />
          </label>
          <label
            className="grid gap-1 text-sm font-medium"
            htmlFor="filtro-ate"
          >
            Até
            <input
              id="filtro-ate"
              name="ate"
              type="date"
              className="sc-campo__controle"
              value={rascunho.ate}
              aria-invalid={props.periodoInvalido || undefined}
              aria-describedby={
                props.periodoInvalido ? "filtro-periodo-erro" : undefined
              }
              onChange={(evento) =>
                props.aoMudar({ ...rascunho, ate: evento.target.value })
              }
            />
          </label>
          <div className="flex gap-2">
            <Botao type="submit" variante="secundaria">
              Filtrar
            </Botao>
            {algumFiltro && (
              <Botao type="button" variante="discreta" onClick={props.aoLimpar}>
                Limpar
              </Botao>
            )}
          </div>
          {props.periodoInvalido && (
            <p
              id="filtro-periodo-erro"
              role="alert"
              className="text-sm text-[var(--cor-erro)] sm:col-span-4"
            >
              {MENSAGEM_DE_PERIODO}
            </p>
          )}
        </form>
      </Cartao>

      {rascunho.loja !== "" && (
        <p className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Selo semBolinha>
            Só a loja {props.nomeDaLojaFiltrada ?? "escolhida"}
          </Selo>
          <Botao
            variante="discreta"
            tamanho="pequeno"
            onClick={props.aoTirarLoja}
          >
            Mostrar todas as lojas
          </Botao>
        </p>
      )}

      <h2 id="historico-de-auditoria" className="sc-so-leitor">
        Atos registrados
      </h2>

      {estado.fase === "carregando" && (
        <Carregando rotulo="Carregando o histórico…" className="mt-6" />
      )}

      {estado.fase === "erro" && (
        <Erro
          titulo="O histórico não carregou"
          mensagem={estado.mensagem}
          className="mt-6"
          acao={
            <Botao variante="secundaria" onClick={props.aoTentarDeNovo}>
              Tentar de novo
            </Botao>
          }
        />
      )}

      {estado.fase === "pronto" && estado.pagina.registros.length === 0 && (
        <Vazio
          titulo="Nenhum ato encontrado"
          descricao={
            algumFiltro
              ? "Nada foi registrado com esses filtros. Amplie o período ou limpe os filtros."
              : "Ainda não há ato registrado na plataforma."
          }
          className="mt-6"
        />
      )}

      {estado.fase === "pronto" && estado.pagina.registros.length > 0 && (
        <PaginaPronta
          pagina={estado.pagina}
          filtrandoLoja={rascunho.loja !== ""}
          aoFiltrarLoja={props.aoFiltrarLoja}
          aoIrParaPagina={props.aoIrParaPagina}
        />
      )}
    </section>
  );
}

function PaginaPronta({
  pagina,
  filtrandoLoja,
  aoFiltrarLoja,
  aoIrParaPagina,
}: {
  readonly pagina: PaginaDaAuditoriaNoContrato;
  readonly filtrandoLoja: boolean;
  readonly aoFiltrarLoja: (registro: RegistroDaAuditoriaNoContrato) => void;
  readonly aoIrParaPagina: (pagina: number) => void;
}) {
  const totalDePaginas = Math.max(
    1,
    Math.ceil(pagina.total / pagina.porPagina),
  );
  // A lista da trilha devolve o registro sem a loja; o mapa a recupera.
  const porId = new Map(
    pagina.registros.map((registro) => [registro.id, registro]),
  );

  return (
    <>
      <p role="status" className="mt-6 text-sm text-[var(--cor-tinta-suave)]">
        {pagina.total === 1
          ? "1 ato encontrado."
          : `${pagina.total} atos encontrados.`}
      </p>
      <div className="mt-3">
        <ListaDaTrilha
          registros={pagina.registros}
          complemento={(registro) => {
            const completo = porId.get(registro.id);
            if (completo === undefined) return null;
            const { loja } = completo;
            return (
              <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm">
                <span>
                  Loja{" "}
                  <Link
                    className="font-medium text-[var(--cor-primaria)] underline-offset-2 hover:underline"
                    href={`/admin/lojas/${loja.id}`}
                  >
                    {loja.codigo} · {loja.nome}
                  </Link>
                </span>
                {!filtrandoLoja && (
                  <Botao
                    variante="discreta"
                    tamanho="pequeno"
                    onClick={() => aoFiltrarLoja(completo)}
                  >
                    Só desta loja
                  </Botao>
                )}
              </p>
            );
          }}
        />
      </div>
      {totalDePaginas > 1 && (
        <nav
          aria-label="Páginas do histórico"
          className="mt-4 flex items-center gap-3 text-sm"
        >
          <Botao
            variante="discreta"
            tamanho="pequeno"
            desabilitado={pagina.pagina <= 1}
            onClick={() => aoIrParaPagina(pagina.pagina - 1)}
          >
            Anterior
          </Botao>
          <span>
            Página {pagina.pagina} de {totalDePaginas}
          </span>
          <Botao
            variante="discreta"
            tamanho="pequeno"
            desabilitado={pagina.pagina >= totalDePaginas}
            onClick={() => aoIrParaPagina(pagina.pagina + 1)}
          >
            Próxima
          </Botao>
        </nav>
      )}
    </>
  );
}

export interface HistoricoDeAuditoriaProps {
  /** A loja que chega pelo endereço (`?loja=`), vinda da ficha. */
  readonly lojaInicial?: string;
}

/** Estado e rede. O desenho é todo de `PainelDaAuditoria`. */
export function HistoricoDeAuditoria({
  lojaInicial = "",
}: HistoricoDeAuditoriaProps) {
  const inicial: FiltrosDaAuditoria = { ...SEM_FILTROS, loja: lojaInicial };
  const [rascunho, setRascunho] = useState<FiltrosDaAuditoria>(inicial);
  const [consulta, setConsulta] = useState({ filtros: inicial, pagina: 1 });
  const [nomeDaLoja, setNomeDaLoja] = useState<string | null>(null);
  const [periodoInvalido, setPeriodoInvalido] = useState(false);
  const [estado, setEstado] = useState<EstadoDoHistorico>({
    fase: "carregando",
  });
  // Tentar de novo repete a MESMA consulta; o contador avisa o efeito.
  const [tentativa, setTentativa] = useState(0);

  const carregar = useCallback(async () => {
    setEstado({ fase: "carregando" });
    try {
      const resposta = await fetch(
        enderecoDoHistorico(consulta.filtros, consulta.pagina),
        { cache: "no-store" },
      );
      if (resposta.status === 401 || resposta.status === 403) {
        setEstado({ fase: "erro", mensagem: MENSAGEM_DE_SESSAO });
        return;
      }
      if (!resposta.ok) {
        setEstado({ fase: "erro", mensagem: MENSAGEM_DE_FALHA });
        return;
      }
      const pagina = esquemaDaPaginaDaAuditoria.parse(await resposta.json());
      const daLoja = pagina.registros.find(
        (registro) => registro.loja.id === consulta.filtros.loja,
      );
      if (daLoja !== undefined) setNomeDaLoja(daLoja.loja.nome);
      setEstado({ fase: "pronto", pagina });
    } catch {
      setEstado({ fase: "erro", mensagem: MENSAGEM_DE_FALHA });
    }
  }, [consulta]);

  useEffect(() => {
    void carregar();
  }, [carregar, tentativa]);

  function aplicar(filtros: FiltrosDaAuditoria): void {
    setRascunho(filtros);
    if (!periodoValido(filtros)) {
      setPeriodoInvalido(true);
      return;
    }
    setPeriodoInvalido(false);
    setConsulta({ filtros, pagina: 1 });
  }

  return (
    <PainelDaAuditoria
      rascunho={rascunho}
      nomeDaLojaFiltrada={nomeDaLoja}
      estado={estado}
      periodoInvalido={periodoInvalido}
      aoMudar={setRascunho}
      aoFiltrar={(evento) => {
        evento.preventDefault();
        aplicar(rascunho);
      }}
      aoLimpar={() => aplicar(SEM_FILTROS)}
      aoFiltrarLoja={(registro) => {
        setNomeDaLoja(registro.loja.nome);
        aplicar({ ...rascunho, loja: registro.loja.id });
      }}
      aoTirarLoja={() => aplicar({ ...rascunho, loja: "" })}
      aoTentarDeNovo={() => setTentativa((anterior) => anterior + 1)}
      aoIrParaPagina={(pagina) =>
        setConsulta((anterior) => ({ ...anterior, pagina }))
      }
    />
  );
}
