"use client";

/**
 * Donos e equipes de todas as lojas (card #170, T-10): a lista de vínculos com
 * as ações de cada um. A consulta mora no endereço
 * (`?tipo=equipe&busca=&loja=&pessoa=&pagina=`); `loja` e `pessoa` chegam dos
 * links das fichas, que só apontam para esta tela (D-5).
 *
 * `loja` e `pessoa` são filtros da tela: a API busca por texto, então a tela
 * lê o nome da loja (ou o e-mail da pessoa), busca por ele e guarda só os
 * vínculos daquele identificador. O termo digitado não vai para links nem
 * título.
 */

import {
  esquemaDaListaDeVinculos,
  TIPOS_DE_VINCULO,
  type ItemDeVinculoNoContrato,
  type ListaDeVinculosNoContrato,
  type TipoDeVinculo,
} from "@simpleclick/contracts";
import {
  Botao,
  Cartao,
  Erro,
  IconeBuscar,
  Selo,
  Tabela,
  type ColunaDaTabela,
} from "@simpleclick/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  JanelaDoVinculo,
  ROTULO_DO_ATO,
  type AtoDoVinculo,
  type PedidoDeAto,
} from "./AcoesDoVinculo.tsx";
import {
  dataCurta,
  lerDaApi,
  NOME_DA_SITUACAO,
  plural,
} from "./apresentacao.ts";
import { PilulasDeFiltro } from "./PilulasDeFiltro.tsx";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPO_PADRAO: TipoDeVinculo = "donos";
const POR_PAGINA = 25;
/** Com filtro de loja ou pessoa a tela lê tudo de uma vez, sem paginar. */
const POR_PAGINA_FILTRADA = 100;

export interface ConsultaDeVinculos {
  readonly tipo: TipoDeVinculo;
  readonly busca: string;
  readonly loja: string | null;
  readonly pessoa: string | null;
  readonly pagina: number;
}

export function consultaDeVinculosDoEndereco(
  parametros: Pick<URLSearchParams, "get">,
): ConsultaDeVinculos {
  const pagina = Number.parseInt(parametros.get("pagina") ?? "1", 10);
  const tipo = TIPOS_DE_VINCULO.find((t) => t === parametros.get("tipo"));
  const loja = parametros.get("loja");
  const pessoa = parametros.get("pessoa");
  return {
    tipo: tipo ?? TIPO_PADRAO,
    busca: parametros.get("busca") ?? "",
    loja: loja !== null && UUID.test(loja) ? loja : null,
    pessoa: pessoa !== null && UUID.test(pessoa) ? pessoa : null,
    pagina: Number.isFinite(pagina) && pagina >= 1 ? pagina : 1,
  };
}

export function enderecoDaPaginaDeVinculos(
  consulta: ConsultaDeVinculos,
): string {
  const parametros = new URLSearchParams();
  if (consulta.tipo !== TIPO_PADRAO) parametros.set("tipo", consulta.tipo);
  if (consulta.busca.trim() !== "") {
    parametros.set("busca", consulta.busca.trim());
  }
  if (consulta.loja !== null) parametros.set("loja", consulta.loja);
  if (consulta.pessoa !== null) parametros.set("pessoa", consulta.pessoa);
  if (consulta.pagina > 1) parametros.set("pagina", String(consulta.pagina));
  const texto = parametros.toString();
  return texto === ""
    ? "/admin/donos-e-equipes"
    : `/admin/donos-e-equipes?${texto}`;
}

/** O endereço da API para a consulta, com o texto que a API sabe buscar. */
export function enderecoDaListaDeVinculos(
  consulta: ConsultaDeVinculos,
  textoDoFiltro: string | null,
): string {
  const filtrada = consulta.loja !== null || consulta.pessoa !== null;
  const busca = (textoDoFiltro ?? consulta.busca).trim().slice(0, 80);
  const parametros = new URLSearchParams({
    tipo: consulta.tipo,
    pagina: filtrada ? "1" : String(consulta.pagina),
    porPagina: String(filtrada ? POR_PAGINA_FILTRADA : POR_PAGINA),
  });
  if (busca !== "") parametros.set("busca", busca);
  return `/api/admin/vinculos?${parametros.toString()}`;
}

/** Só os vínculos da loja ou da pessoa filtrada. */
export function filtrarVinculos(
  vinculos: readonly ItemDeVinculoNoContrato[],
  consulta: Pick<ConsultaDeVinculos, "loja" | "pessoa" | "busca">,
): ItemDeVinculoNoContrato[] {
  return vinculos.filter(
    (v) =>
      (consulta.loja === null || v.lojaId === consulta.loja) &&
      (consulta.pessoa === null || v.identidadeId === consulta.pessoa),
  );
}

/** O que o filtro de loja ou pessoa mostra no cabeçalho. */
interface RotuloDoFiltro {
  readonly loja: { readonly lojaId: string; readonly nome: string } | null;
  readonly pessoa: string | null;
  /** O texto que a API sabe buscar para achar a loja ou a pessoa. */
  readonly textoDeBusca: string | null;
}

type EstadoDaLista =
  | { readonly fase: "carregando" }
  | { readonly fase: "erro"; readonly mensagem: string }
  | {
      readonly fase: "pronta";
      readonly lista: ListaDeVinculosNoContrato;
      readonly itens: readonly ItemDeVinculoNoContrato[];
    };

const NOME_DO_TIPO: Readonly<Record<TipoDeVinculo, string>> = {
  donos: "Donos",
  equipe: "Equipe",
};

function textoDe(corpo: unknown, campo: string): string | null {
  if (typeof corpo !== "object" || corpo === null) return null;
  const valor = (corpo as Record<string, unknown>)[campo];
  return typeof valor === "string" && valor !== "" ? valor : null;
}

export function ListaDeVinculos() {
  const parametros = useSearchParams();
  const roteador = useRouter();
  const consulta = useMemo(
    () => consultaDeVinculosDoEndereco(parametros ?? new URLSearchParams()),
    [parametros],
  );
  const [termo, setTermo] = useState(consulta.busca);
  const [estado, setEstado] = useState<EstadoDaLista>({ fase: "carregando" });
  const [rotulo, setRotulo] = useState<RotuloDoFiltro>({
    loja: null,
    pessoa: null,
    textoDeBusca: null,
  });
  const [tentativa, setTentativa] = useState(0);
  const [pedido, setPedido] = useState<PedidoDeAto | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    setTermo(consulta.busca);
  }, [consulta.busca]);

  const carregar = useCallback(async () => {
    setEstado({ fase: "carregando" });

    // 1) o filtro: o nome da loja ou o e-mail da pessoa viram o texto de busca.
    let filtro: RotuloDoFiltro = { loja: null, pessoa: null, textoDeBusca: null };
    if (consulta.loja !== null) {
      const leitura = await lerDaApi(
        `/api/admin/lojas/${encodeURIComponent(consulta.loja)}`,
        (corpo) => ({
          nome: textoDe(corpo, "nome") ?? "Loja",
          apelido: textoDe(corpo, "apelido"),
        }),
      );
      if (leitura.fase === "nao-encontrada") {
        setEstado({ fase: "erro", mensagem: "Essa loja não foi encontrada." });
        return;
      }
      if (leitura.fase === "erro") {
        setEstado({ fase: "erro", mensagem: leitura.mensagem });
        return;
      }
      filtro = {
        loja: { lojaId: consulta.loja, nome: leitura.dados.nome },
        pessoa: null,
        textoDeBusca: leitura.dados.nome,
      };
    } else if (consulta.pessoa !== null) {
      const leitura = await lerDaApi(
        `/api/admin/pessoas/${encodeURIComponent(consulta.pessoa)}`,
        (corpo) => ({
          nome: textoDe(corpo, "nome"),
          email: textoDe(corpo, "email"),
        }),
      );
      if (leitura.fase === "nao-encontrada") {
        setEstado({ fase: "erro", mensagem: "Essa pessoa não foi encontrada." });
        return;
      }
      if (leitura.fase === "erro") {
        setEstado({ fase: "erro", mensagem: leitura.mensagem });
        return;
      }
      filtro = {
        loja: null,
        pessoa: leitura.dados.nome ?? leitura.dados.email ?? "Pessoa",
        textoDeBusca: leitura.dados.email,
      };
    }
    setRotulo(filtro);

    // 2) os vínculos.
    const leitura = await lerDaApi(
      enderecoDaListaDeVinculos(consulta, filtro.textoDeBusca),
      (corpo) => esquemaDaListaDeVinculos.parse(corpo),
      "Não foi possível carregar os vínculos agora. Tente de novo em instantes.",
    );
    if (leitura.fase === "pronta") {
      setEstado({
        fase: "pronta",
        lista: leitura.dados,
        itens: filtrarVinculos(leitura.dados.vinculos, consulta),
      });
    } else {
      setEstado({
        fase: "erro",
        mensagem:
          leitura.fase === "erro"
            ? leitura.mensagem
            : "Os vínculos não foram encontrados.",
      });
    }
  }, [consulta]);

  useEffect(() => {
    void carregar();
  }, [carregar, tentativa]);

  const ir = useCallback(
    (proxima: ConsultaDeVinculos) =>
      roteador.replace(enderecoDaPaginaDeVinculos(proxima), { scroll: false }),
    [roteador],
  );

  function pedir(ato: AtoDoVinculo, v: ItemDeVinculoNoContrato) {
    setAviso(null);
    setPedido({
      ato,
      loja: { lojaId: v.lojaId, nome: v.lojaNome },
      pessoa: {
        identidadeId: v.identidadeId,
        nome: v.pessoaNome,
        email: v.pessoaEmail,
      },
    });
  }

  function pedirParaALoja(ato: AtoDoVinculo) {
    if (rotulo.loja === null) return;
    setAviso(null);
    setPedido({ ato, loja: rotulo.loja });
  }

  const colunas: ColunaDaTabela<ItemDeVinculoNoContrato>[] = [
    {
      chave: "loja",
      titulo: "Loja",
      celula: (v) => (
        <>
          <Link
            className="font-medium text-[var(--cor-primaria-texto)] underline-offset-2 hover:underline"
            href={`/admin/lojas/${v.lojaId}`}
            prefetch={false}
          >
            {v.lojaNome}
          </Link>
          <span className="block text-xs text-[var(--cor-tinta-suave)]">
            {NOME_DA_SITUACAO[v.lojaStatus]}
          </span>
        </>
      ),
    },
    {
      chave: "pessoa",
      titulo: "Pessoa",
      celula: (v) => (
        <>
          <Link
            className="font-medium text-[var(--cor-primaria-texto)] underline-offset-2 hover:underline"
            href={`/admin/contas/${v.identidadeId}`}
            prefetch={false}
          >
            {v.pessoaNome ?? v.pessoaEmail}
          </Link>
          {v.pessoaNome !== null && (
            <span className="block text-xs text-[var(--cor-tinta-suave)]">
              {v.pessoaEmail}
            </span>
          )}
        </>
      ),
    },
    {
      chave: "papel",
      titulo: "Papel",
      celula: (v) => (
        <Selo tom={v.papel === "OWNER" ? "info" : "neutro"} semBolinha>
          {v.papel === "OWNER" ? "Dono" : "Equipe"}
        </Selo>
      ),
    },
    {
      chave: "desde",
      titulo: "Desde",
      celula: (v) => <time dateTime={v.desde}>{dataCurta(v.desde)}</time>,
    },
    {
      chave: "acoes",
      titulo: "Ações",
      celula: (v) => (
        <span className="flex flex-wrap gap-2">
          {(v.papel === "OWNER"
            ? (["trocar-dono", "remover-dono"] as const)
            : (["tornar-dono", "remover-equipe"] as const)
          ).map((ato) => (
            <Botao
              key={ato}
              variante={ato.startsWith("remover") ? "discreta" : "secundaria"}
              tamanho="pequeno"
              onClick={() => pedir(ato, v)}
            >
              {ROTULO_DO_ATO[ato]}
            </Botao>
          ))}
        </span>
      ),
    },
  ];

  const itens = estado.fase === "pronta" ? estado.itens : [];
  const filtrada = consulta.loja !== null || consulta.pessoa !== null;
  const totalDePaginas =
    estado.fase === "pronta"
      ? Math.max(1, Math.ceil(estado.lista.total / estado.lista.porPagina))
      : 1;

  return (
    <section
      aria-labelledby="lista-de-vinculos"
      className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-5"
    >
      <h2 id="lista-de-vinculos" className="sc-so-leitor">
        Vínculos de donos e equipes
      </h2>
      <Cartao>
        <div className="grid gap-4">
          {filtrada && (
            <p className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                Mostrando só{" "}
                {rotulo.loja !== null
                  ? `a loja ${rotulo.loja.nome}`
                  : `os vínculos de ${rotulo.pessoa ?? "uma pessoa"}`}
                .
              </span>
              <Botao
                variante="discreta"
                tamanho="pequeno"
                onClick={() =>
                  ir({ ...consulta, loja: null, pessoa: null, pagina: 1 })
                }
              >
                Ver todas as lojas
              </Botao>
            </p>
          )}
          <PilulasDeFiltro
            rotulo="Tipo de vínculo"
            pilulas={TIPOS_DE_VINCULO.map((valor) => ({
              valor,
              rotulo: NOME_DO_TIPO[valor],
            }))}
            valor={consulta.tipo}
            aoEscolher={(tipo) => ir({ ...consulta, tipo, pagina: 1 })}
          />
          {!filtrada && (
            <form
              role="search"
              onSubmit={(evento: FormEvent<HTMLFormElement>) => {
                evento.preventDefault();
                ir({ ...consulta, busca: termo, pagina: 1 });
              }}
              className="flex flex-wrap items-end gap-4"
            >
              <label
                className="grid min-w-[16rem] flex-1 gap-1 text-sm font-medium"
                htmlFor="busca-de-vinculos"
              >
                Buscar por loja, nome ou e-mail
                <input
                  id="busca-de-vinculos"
                  name="busca"
                  type="search"
                  className="sc-campo__controle"
                  value={termo}
                  autoComplete="off"
                  onChange={(evento) => setTermo(evento.target.value)}
                />
              </label>
              <Botao
                type="submit"
                variante="secundaria"
                icone={<IconeBuscar />}
              >
                Buscar
              </Botao>
            </form>
          )}
          {rotulo.loja !== null && (
            <span className="flex flex-wrap gap-2">
              <Botao
                variante="primaria"
                onClick={() => pedirParaALoja("atribuir-dono")}
              >
                {ROTULO_DO_ATO["atribuir-dono"]}
              </Botao>
              <Botao
                variante="secundaria"
                onClick={() => pedirParaALoja("atribuir-equipe")}
              >
                {ROTULO_DO_ATO["atribuir-equipe"]}
              </Botao>
            </span>
          )}
          {!filtrada && (
            <p className="text-sm text-[var(--cor-tinta-suave)]">
              Para atribuir alguém a uma loja, abra a ficha dela e use
              “Gerenciar donos e equipe”.
            </p>
          )}
        </div>
      </Cartao>

      {aviso !== null && (
        <p role="status" className="text-sm font-medium">
          {aviso}
        </p>
      )}

      {estado.fase === "erro" && (
        <Erro
          titulo="Os vínculos não carregaram"
          mensagem={estado.mensagem}
          acao={
            <Botao
              variante="secundaria"
              onClick={() => setTentativa((n) => n + 1)}
            >
              Tentar de novo
            </Botao>
          }
        />
      )}
      {estado.fase === "carregando" && (
        <Cartao
          titulo="Vínculos"
          estado="carregando"
          esperaComEsqueleto
          rotuloDeEspera="Carregando vínculos…"
        />
      )}
      {estado.fase === "pronta" && itens.length === 0 && (
        <Cartao
          estado="vazio"
          tituloVazio={
            consulta.tipo === "donos"
              ? "Nenhum dono encontrado"
              : "Nenhuma equipe encontrada"
          }
          descricaoVazio={
            filtrada
              ? "Nada aqui para este filtro. Use os botões acima para atribuir alguém."
              : "Confira a busca. Só vínculos aceitos e não retirados aparecem."
          }
        />
      )}
      {estado.fase === "pronta" && itens.length > 0 && (
        <div>
          <p role="status" className="sc-so-leitor">
            {plural(itens.length, "vínculo", "vínculos")}.
          </p>
          <Cartao
            titulo={NOME_DO_TIPO[consulta.tipo]}
            descricao={`${plural(
              filtrada ? itens.length : estado.lista.total,
              "vínculo encontrado",
              "vínculos encontrados",
            )}.`}
          >
            <Tabela
              legenda={NOME_DO_TIPO[consulta.tipo]}
              legendaEscondida
              colunas={colunas}
              linhas={itens}
              chaveDaLinha={(v) => `${v.lojaId}-${v.identidadeId}-${v.papel}`}
              noCelular="cartoes"
            />
            {!filtrada && totalDePaginas > 1 && (
              <nav
                aria-label="Páginas da lista"
                className="mt-4 flex flex-wrap items-center gap-3 text-sm"
              >
                <Botao
                  variante="discreta"
                  tamanho="pequeno"
                  desabilitado={estado.lista.pagina <= 1}
                  onClick={() =>
                    ir({ ...consulta, pagina: estado.lista.pagina - 1 })
                  }
                >
                  Anterior
                </Botao>
                <span>
                  Página {estado.lista.pagina} de {totalDePaginas}
                </span>
                <Botao
                  variante="discreta"
                  tamanho="pequeno"
                  desabilitado={estado.lista.pagina >= totalDePaginas}
                  onClick={() =>
                    ir({ ...consulta, pagina: estado.lista.pagina + 1 })
                  }
                >
                  Próxima
                </Botao>
              </nav>
            )}
          </Cartao>
        </div>
      )}

      {pedido !== null && (
        <JanelaDoVinculo
          pedido={pedido}
          aoFechar={() => setPedido(null)}
          aoConcluir={() => {
            setPedido(null);
            setAviso("Feito. O ato ficou registrado na auditoria.");
            setTentativa((n) => n + 1);
          }}
        />
      )}
    </section>
  );
}
