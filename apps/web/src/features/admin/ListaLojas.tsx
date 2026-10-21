"use client";

/**
 * A lista de lojas da administração (AC-206, card #29).
 *
 * A consulta mora na ENDEREÇO da página (`?situacao=&tipo=&ordem=&busca=&pagina=`):
 * o item "Pendentes" do menu, um link guardado e o botão de voltar levam à
 * mesma lista. `ListaLojas` lê o endereço, busca na API e guarda o estado;
 * `TabelaDeLojas` só desenha — e é ela que a prova confere nos quatro estados
 * (P-011), sem navegador nem rede.
 *
 * A busca é UM campo só, de propósito: quem atende o telefone tem na mão um
 * nome, um CNPJ, um código ou o e-mail do dono, e é a API que descobre qual.
 */

import {
  esquemaDaListaDeLojas,
  ORDENS_DA_LISTA_DE_LOJAS,
  ROTULOS_DAS_ORDENS_DA_LISTA,
  type ListaDeLojasNoContrato,
  type LojaNaListaNoContrato,
  type OrdemDaListaDeLojas,
  type SituacaoDaLoja,
} from "@simpleclick/contracts";
import {
  Aviso,
  Botao,
  Cartao,
  type ColunaDaTabela,
  Erro,
  IconeBuscar,
  Info,
  Seletor,
  Selo,
  Tabela,
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

import { AtosDeAprovacao } from "./AtosDeAprovacao.tsx";
import { INFO_DOS_TOTAIS_DA_LISTA } from "./explicacoes.ts";
import {
  dataCurta,
  inteiro,
  NOME_DA_SITUACAO,
  reais,
  TOM_DA_SITUACAO,
} from "./apresentacao.ts";
import { PilulasDeFiltro, type PilulaDeFiltro } from "./PilulasDeFiltro.tsx";

export type EstadoDaLista =
  | { readonly fase: "carregando" }
  | { readonly fase: "erro"; readonly mensagem: string }
  | { readonly fase: "pronta"; readonly lista: ListaDeLojasNoContrato };

/** O filtro de situação da lista; `null` é "todas" (menos as excluídas). */
export type FiltroDeSituacao = Exclude<SituacaoDaLoja, "DELETED"> | null;

export interface ConsultaDaLista {
  readonly busca: string;
  readonly situacao: FiltroDeSituacao;
  /** Código do tipo de negócio; vazio é "todos". */
  readonly tipo: string;
  readonly ordem: OrdemDaListaDeLojas;
  readonly pagina: number;
}

export const CONSULTA_INICIAL: ConsultaDaLista = {
  busca: "",
  situacao: null,
  tipo: "",
  ordem: "recentes",
  pagina: 1,
};

export interface TipoParaFiltro {
  readonly codigo: string;
  readonly nome: string;
}

export interface TabelaDeLojasProps {
  readonly consulta: ConsultaDaLista;
  /** O que está digitado no campo de busca (ainda não enviado). */
  readonly termo: string;
  readonly tipos: readonly TipoParaFiltro[];
  readonly estado: EstadoDaLista;
  readonly aoMudarTermo: (termo: string) => void;
  readonly aoBuscar: (evento: FormEvent<HTMLFormElement>) => void;
  readonly aoMudarFiltro: (mudanca: Partial<ConsultaDaLista>) => void;
  readonly aoTentarDeNovo: () => void;
  readonly aoIrParaPagina: (pagina: number) => void;
  /** Uma loja mudou de situação aqui na lista (aprovada ou recusada). */
  readonly aoMudarLoja: () => void;
}

/** A data do cadastro como a administração a lê: dia/mês/ano, em Brasília. */
export function dataDeCadastro(iso: string): string {
  return dataCurta(iso);
}

export const MENSAGEM_DE_SESSAO =
  "Sua sessão não tem acesso à administração. Entre de novo.";
export const MENSAGEM_DE_FALHA =
  "Não foi possível carregar as lojas agora. Tente de novo em instantes.";

const SITUACOES_DA_LISTA: readonly Exclude<SituacaoDaLoja, "DELETED">[] = [
  "PENDING_APPROVAL",
  "ACTIVE",
  "INACTIVE",
  "REJECTED",
];

/** O filtro escolhido no endereço, ou nenhum se o valor não é conhecido. */
function situacaoDoEndereco(valor: string | null): FiltroDeSituacao {
  return SITUACOES_DA_LISTA.find((situacao) => situacao === valor) ?? null;
}

/** Lê a consulta do endereço da página. */
export function consultaDoEndereco(
  parametros: Pick<URLSearchParams, "get">,
): ConsultaDaLista {
  const ordem = ORDENS_DA_LISTA_DE_LOJAS.find(
    (candidata) => candidata === parametros.get("ordem"),
  );
  const pagina = Number.parseInt(parametros.get("pagina") ?? "1", 10);
  return {
    busca: parametros.get("busca") ?? "",
    situacao: situacaoDoEndereco(parametros.get("situacao")),
    tipo: parametros.get("tipo") ?? "",
    ordem: ordem ?? "recentes",
    pagina: Number.isFinite(pagina) && pagina >= 1 ? pagina : 1,
  };
}

/** O endereço da página para esta consulta (só o que difere do padrão). */
export function enderecoDaPagina(consulta: ConsultaDaLista): string {
  const parametros = new URLSearchParams();
  if (consulta.situacao !== null) parametros.set("situacao", consulta.situacao);
  if (consulta.tipo !== "") parametros.set("tipo", consulta.tipo);
  if (consulta.ordem !== "recentes") parametros.set("ordem", consulta.ordem);
  if (consulta.busca.trim() !== "")
    parametros.set("busca", consulta.busca.trim());
  if (consulta.pagina > 1) parametros.set("pagina", String(consulta.pagina));
  const texto = parametros.toString();
  return texto === "" ? "/admin/lojas" : `/admin/lojas?${texto}`;
}

/** O endereço que a tela consulta no próprio site, com a consulta montada. */
export function enderecoDaLista(
  consulta: Partial<ConsultaDaLista> & Pick<ConsultaDaLista, "pagina">,
): string {
  const parametros = new URLSearchParams({ pagina: String(consulta.pagina) });
  if ((consulta.busca ?? "").trim() !== "")
    parametros.set("busca", (consulta.busca ?? "").trim());
  if (consulta.situacao !== undefined && consulta.situacao !== null)
    parametros.set("situacao", consulta.situacao);
  if ((consulta.tipo ?? "") !== "") parametros.set("tipo", consulta.tipo ?? "");
  if (consulta.ordem !== undefined && consulta.ordem !== "recentes")
    parametros.set("ordem", consulta.ordem);
  return `/api/admin/lojas?${parametros.toString()}`;
}

function pilulasDaLista(
  lista: ListaDeLojasNoContrato | null,
): PilulaDeFiltro<string>[] {
  const c = lista?.contagens;
  return [
    { valor: "TODAS", rotulo: "Todas", quantidade: c?.todas },
    {
      valor: "PENDING_APPROVAL",
      rotulo: "Pendentes de aprovação",
      quantidade: c?.PENDING_APPROVAL,
      destaque: true,
    },
    { valor: "ACTIVE", rotulo: "Ativas", quantidade: c?.ACTIVE },
    { valor: "INACTIVE", rotulo: "Inativas", quantidade: c?.INACTIVE },
    { valor: "REJECTED", rotulo: "Recusadas", quantidade: c?.REJECTED },
  ];
}

const SELETOR = "min-w-[12rem]";

/** Só desenha. Nenhuma chamada de rede mora aqui, fora dos atos de aprovação. */
export function TabelaDeLojas(props: TabelaDeLojasProps) {
  const { estado, termo, consulta } = props;
  const lista = estado.fase === "pronta" ? estado.lista : null;
  const pendentes = lista?.contagens.PENDING_APPROVAL ?? 0;
  const filtrando =
    consulta.busca.trim() !== "" ||
    consulta.situacao !== null ||
    consulta.tipo !== "";

  return (
    <section
      aria-labelledby="lista-de-lojas"
      className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6"
    >
      <h2 id="lista-de-lojas" className="sc-so-leitor">
        Lojas cadastradas
      </h2>

      {pendentes > 0 && consulta.situacao !== "PENDING_APPROVAL" && (
        <Aviso
          tom="atencao"
          aoVivo={false}
          titulo={
            pendentes === 1
              ? "1 loja espera a sua aprovação"
              : `${pendentes} lojas esperam a sua aprovação`
          }
          acao={
            <Botao
              variante="primaria"
              onClick={() =>
                props.aoMudarFiltro({ situacao: "PENDING_APPROVAL", pagina: 1 })
              }
            >
              Ver pendentes
            </Botao>
          }
        >
          <p>Lojas novas só entram no ar depois de aprovadas.</p>
        </Aviso>
      )}

      <Cartao>
        <div className="grid gap-4">
          <PilulasDeFiltro
            rotulo="Filtrar por situação"
            pilulas={pilulasDaLista(lista)}
            valor={consulta.situacao ?? "TODAS"}
            aoEscolher={(valor) =>
              props.aoMudarFiltro({
                situacao: situacaoDoEndereco(valor),
                pagina: 1,
              })
            }
          />
          <form
            role="search"
            onSubmit={props.aoBuscar}
            className="flex flex-wrap items-end gap-4"
          >
            <label
              className="grid min-w-[16rem] flex-1 gap-1 text-sm font-medium"
              htmlFor="busca-de-lojas"
            >
              Buscar por loja, dono, CPF/CNPJ ou código
              <input
                id="busca-de-lojas"
                name="busca"
                type="search"
                className="sc-campo__controle"
                value={termo}
                placeholder="Pastel da Joi, marina@…, 11.222.333/0001-81 ou 0002"
                autoComplete="off"
                onChange={(evento) => props.aoMudarTermo(evento.target.value)}
              />
            </label>
            <label
              className="grid gap-1 text-sm font-medium"
              htmlFor="filtro-de-tipo"
            >
              Tipo de negócio
              <Seletor
                id="filtro-de-tipo"
                className={SELETOR}
                value={consulta.tipo}
                onChange={(valor) =>
                  props.aoMudarFiltro({ tipo: valor, pagina: 1 })
                }
              >
                <option value="">Todos os tipos</option>
                {props.tipos.map((tipo) => (
                  <option key={tipo.codigo} value={tipo.codigo}>
                    {tipo.nome}
                  </option>
                ))}
              </Seletor>
            </label>
            <label
              className="grid gap-1 text-sm font-medium"
              htmlFor="ordem-das-lojas"
            >
              Ordenar por
              <Seletor
                id="ordem-das-lojas"
                className={SELETOR}
                value={consulta.ordem}
                onChange={(valor) =>
                  props.aoMudarFiltro({
                    ordem: valor as OrdemDaListaDeLojas,
                    pagina: 1,
                  })
                }
              >
                {ORDENS_DA_LISTA_DE_LOJAS.map((ordem) => (
                  <option key={ordem} value={ordem}>
                    {ROTULOS_DAS_ORDENS_DA_LISTA[ordem]}
                  </option>
                ))}
              </Seletor>
            </label>
            <Botao type="submit" variante="secundaria" icone={<IconeBuscar />}>
              Buscar
            </Botao>
          </form>
        </div>
      </Cartao>

      {estado.fase === "erro" && (
        <Erro
          titulo="A lista não carregou"
          mensagem={estado.mensagem}
          acao={
            <Botao variante="secundaria" onClick={props.aoTentarDeNovo}>
              Tentar de novo
            </Botao>
          }
        />
      )}

      {estado.fase === "carregando" && (
        <Cartao
          titulo="Lojas cadastradas"
          estado="carregando"
          esperaComEsqueleto
          rotuloDeEspera="Carregando lojas…"
        />
      )}

      {estado.fase === "pronta" && estado.lista.lojas.length === 0 && (
        <Cartao
          estado="vazio"
          tituloVazio={
            consulta.situacao === "PENDING_APPROVAL"
              ? "Nenhuma loja esperando aprovação"
              : "Nenhuma loja encontrada"
          }
          descricaoVazio={
            consulta.situacao === "PENDING_APPROVAL"
              ? "Quando um lojista abrir uma loja, ela aparece aqui para você aprovar."
              : filtrando
                ? "Mude os filtros ou confira o nome, o documento ou o código e busque de novo."
                : "Cadastre a primeira loja da plataforma."
          }
          rodape={
            filtrando ? (
              <Botao
                variante="secundaria"
                onClick={() =>
                  props.aoMudarFiltro({
                    ...CONSULTA_INICIAL,
                    ordem: consulta.ordem,
                  })
                }
              >
                Limpar filtros
              </Botao>
            ) : (
              <Link
                className="sc-botao sc-botao--primaria"
                href="/admin/lojas/nova"
              >
                Cadastrar loja
              </Link>
            )
          }
        />
      )}

      {estado.fase === "pronta" && estado.lista.lojas.length > 0 && (
        <ListaPronta
          lista={estado.lista}
          aoIrParaPagina={props.aoIrParaPagina}
          aoMudarLoja={props.aoMudarLoja}
        />
      )}
    </section>
  );
}

function ListaPronta({
  lista,
  aoIrParaPagina,
  aoMudarLoja,
}: {
  readonly lista: ListaDeLojasNoContrato;
  readonly aoIrParaPagina: (pagina: number) => void;
  readonly aoMudarLoja: () => void;
}) {
  const totalDePaginas = Math.max(1, Math.ceil(lista.total / lista.porPagina));
  const colunas: readonly ColunaDaTabela<LojaNaListaNoContrato>[] = [
    {
      chave: "nome",
      titulo: "Loja",
      celula: (loja) => (
        <>
          <Link
            className="font-medium text-[var(--cor-primaria-texto)] underline-offset-2 hover:underline"
            href={`/admin/lojas/${loja.id}`}
          >
            {loja.nome}
          </Link>
          <span className="block text-xs text-[var(--cor-tinta-suave)]">
            <span className="font-mono">{loja.codigo}</span> · /loja/
            {loja.apelido}
            {loja.cidade !== null && loja.uf !== null
              ? ` · ${loja.cidade}/${loja.uf}`
              : ""}
          </span>
        </>
      ),
    },
    {
      chave: "dono",
      titulo: "Dono",
      celula: (loja) =>
        loja.dono === null ? (
          <span className="text-[var(--cor-tinta-suave)]">Sem dono</span>
        ) : (
          <Link
            className="underline-offset-2 hover:underline"
            href={`/admin/contas/${loja.dono.identidadeId}`}
          >
            {loja.dono.nome ?? "Dono sem nome"}
          </Link>
        ),
    },
    {
      chave: "tipo",
      titulo: "Tipo de negócio",
      celula: (loja) => loja.tipoDeNegocio.nome,
    },
    {
      chave: "status",
      titulo: "Situação",
      celula: (loja) => (
        <Selo tom={TOM_DA_SITUACAO[loja.status]}>
          {NOME_DA_SITUACAO[loja.status]}
        </Selo>
      ),
    },
    {
      chave: "pedidos",
      titulo: "Pedidos (total)",
      alinhamento: "fim",
      celula: (loja) => inteiro(loja.pedidos),
    },
    {
      chave: "faturamento",
      titulo: "Faturamento total",
      alinhamento: "fim",
      celula: (loja) => reais(loja.faturamentoCentavos),
    },
    {
      chave: "criadaEm",
      titulo: "Criada em",
      celula: (loja) => (
        <time dateTime={loja.criadaEm}>{dataDeCadastro(loja.criadaEm)}</time>
      ),
    },
    {
      chave: "acoes",
      titulo: "Ações",
      celula: (loja) =>
        loja.status === "PENDING_APPROVAL" ? (
          <AtosDeAprovacao
            loja={loja}
            tamanho="pequeno"
            aoMudar={aoMudarLoja}
          />
        ) : (
          <Link
            className="text-sm font-medium text-[var(--cor-primaria-texto)] underline-offset-2 hover:underline"
            href={`/admin/lojas/${loja.id}`}
          >
            Abrir
          </Link>
        ),
    },
  ];

  const resumo =
    lista.total === 1
      ? "1 loja encontrada."
      : `${lista.total} lojas encontradas.`;

  return (
    <div>
      <p role="status" className="sc-so-leitor">
        {resumo}
      </p>
      <Cartao titulo="Lojas cadastradas" descricao={resumo}>
        <p className="mb-3 flex flex-wrap items-center gap-1 text-sm text-[var(--cor-tinta-suave)]">
          Pedidos e faturamento contam desde o cadastro de cada loja.
          <Info
            rotulo="Pedidos (total) e Faturamento total"
            conteudo={INFO_DOS_TOTAIS_DA_LISTA}
          />
        </p>
        <Tabela
          legenda="Lojas cadastradas"
          legendaEscondida
          colunas={colunas}
          linhas={lista.lojas}
          chaveDaLinha={(loja) => loja.id}
          noCelular="cartoes"
        />
        {totalDePaginas > 1 && (
          <nav
            aria-label="Páginas da lista"
            className="mt-4 flex flex-wrap items-center gap-3 text-sm"
          >
            <Botao
              variante="discreta"
              tamanho="pequeno"
              desabilitado={lista.pagina <= 1}
              onClick={() => aoIrParaPagina(lista.pagina - 1)}
            >
              Anterior
            </Botao>
            <span>
              Página {lista.pagina} de {totalDePaginas}
            </span>
            <Botao
              variante="discreta"
              tamanho="pequeno"
              desabilitado={lista.pagina >= totalDePaginas}
              onClick={() => aoIrParaPagina(lista.pagina + 1)}
            >
              Próxima
            </Botao>
          </nav>
        )}
      </Cartao>
    </div>
  );
}

/** Estado e rede. O desenho é todo de `TabelaDeLojas`. */
export function ListaLojas() {
  const parametros = useSearchParams();
  const roteador = useRouter();
  const consulta = useMemo(
    () => consultaDoEndereco(parametros ?? new URLSearchParams()),
    [parametros],
  );
  const [termo, setTermo] = useState(consulta.busca);
  const [estado, setEstado] = useState<EstadoDaLista>({ fase: "carregando" });
  const [tipos, setTipos] = useState<readonly TipoParaFiltro[]>([]);
  // Tentar de novo repete a MESMA consulta; sem este contador, o efeito não
  // teria como saber que a pessoa pediu para repetir.
  const [tentativa, setTentativa] = useState(0);

  // Uma busca nova vinda de fora (o menu, o botão de voltar) troca o campo.
  useEffect(() => {
    setTermo(consulta.busca);
  }, [consulta.busca]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const resposta = await fetch("/api/admin/tipos-de-negocio", {
          cache: "no-store",
        });
        if (!resposta.ok) return;
        const corpo = (await resposta.json()) as {
          tipos?: { codigo: string; nome: string }[];
        };
        if (vivo && Array.isArray(corpo.tipos)) {
          setTipos(corpo.tipos.map(({ codigo, nome }) => ({ codigo, nome })));
        }
      } catch {
        // Sem a lista de tipos o filtro fica só com "Todos os tipos".
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const carregar = useCallback(async () => {
    setEstado({ fase: "carregando" });
    try {
      const resposta = await fetch(enderecoDaLista(consulta), {
        cache: "no-store",
      });
      if (resposta.status === 401 || resposta.status === 403) {
        setEstado({ fase: "erro", mensagem: MENSAGEM_DE_SESSAO });
        return;
      }
      if (!resposta.ok) {
        setEstado({ fase: "erro", mensagem: MENSAGEM_DE_FALHA });
        return;
      }
      const lista = esquemaDaListaDeLojas.parse(await resposta.json());
      setEstado({ fase: "pronta", lista });
    } catch {
      setEstado({ fase: "erro", mensagem: MENSAGEM_DE_FALHA });
    }
  }, [consulta]);

  useEffect(() => {
    void carregar();
  }, [carregar, tentativa]);

  const ir = useCallback(
    (proxima: ConsultaDaLista) => {
      roteador.replace(enderecoDaPagina(proxima), { scroll: false });
    },
    [roteador],
  );

  return (
    <TabelaDeLojas
      consulta={consulta}
      termo={termo}
      tipos={tipos}
      estado={estado}
      aoMudarTermo={setTermo}
      aoBuscar={(evento) => {
        evento.preventDefault();
        ir({ ...consulta, busca: termo, pagina: 1 });
      }}
      aoMudarFiltro={(mudanca) => ir({ ...consulta, ...mudanca })}
      aoTentarDeNovo={() => setTentativa((anterior) => anterior + 1)}
      aoIrParaPagina={(pagina) => ir({ ...consulta, pagina })}
      aoMudarLoja={() => {
        setTentativa((anterior) => anterior + 1);
        // O contador de pendentes do menu vem do servidor: recarrega a casca.
        roteador.refresh();
      }}
    />
  );
}
