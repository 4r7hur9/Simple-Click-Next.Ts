"use client";

/**
 * As pessoas da plataforma na administração (card #170, T-9): clientes, donos
 * e equipe numa lista só, com a situação de cada conta. A consulta mora no
 * endereço da página (`?tipo=donos&situacao=desativadas&busca=`), como a lista
 * de lojas.
 *
 * A lista mostra o mínimo (D-9): nome, e-mail, tipo e situação. Telefone só na
 * ficha; documento e endereço em lugar nenhum. A busca é por nome ou e-mail, e
 * o termo digitado nunca vai para título, link nem mensagem: os links para a
 * ficha levam só o identificador e não fazem prefetch.
 *
 * `TabelaDeContas` só desenha; `ListaDeContas` guarda a consulta e fala com a
 * rede.
 */

import {
  esquemaDaListaDePessoas,
  SITUACOES_DA_PESSOA,
  TIPOS_DE_PESSOA,
  type ItemDePessoaNoContrato,
  type ListaDePessoasNoContrato,
  type SituacaoDaPessoa,
  type TipoDePessoa,
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
  dataCurta,
  lerDaApi,
  plural,
  type LeituraDaApi,
} from "./apresentacao.ts";
import { PilulasDeFiltro } from "./PilulasDeFiltro.tsx";

export interface ConsultaDeContas {
  readonly tipo: TipoDePessoa;
  readonly situacao: SituacaoDaPessoa;
  readonly busca: string;
  readonly pagina: number;
}

export type EstadoDasContas =
  | { readonly fase: "carregando" }
  | { readonly fase: "erro"; readonly mensagem: string }
  | { readonly fase: "pronta"; readonly lista: ListaDePessoasNoContrato };

const TIPO_PADRAO: TipoDePessoa = "todas";
const SITUACAO_PADRAO: SituacaoDaPessoa = "ativas";

function daLista<T extends string>(
  valor: string | null,
  validos: readonly T[],
  padrao: T,
): T {
  return validos.find((candidato) => candidato === valor) ?? padrao;
}

export function consultaDeContasDoEndereco(
  parametros: Pick<URLSearchParams, "get">,
): ConsultaDeContas {
  const pagina = Number.parseInt(parametros.get("pagina") ?? "1", 10);
  return {
    tipo: daLista(parametros.get("tipo"), TIPOS_DE_PESSOA, TIPO_PADRAO),
    situacao: daLista(
      parametros.get("situacao"),
      SITUACOES_DA_PESSOA,
      SITUACAO_PADRAO,
    ),
    busca: parametros.get("busca") ?? "",
    pagina: Number.isFinite(pagina) && pagina >= 1 ? pagina : 1,
  };
}

export function enderecoDaPaginaDeContas(consulta: ConsultaDeContas): string {
  const parametros = new URLSearchParams();
  if (consulta.tipo !== TIPO_PADRAO) parametros.set("tipo", consulta.tipo);
  if (consulta.situacao !== SITUACAO_PADRAO) {
    parametros.set("situacao", consulta.situacao);
  }
  if (consulta.busca.trim() !== "")
    parametros.set("busca", consulta.busca.trim());
  if (consulta.pagina > 1) parametros.set("pagina", String(consulta.pagina));
  const texto = parametros.toString();
  return texto === "" ? "/admin/contas" : `/admin/contas?${texto}`;
}

export function enderecoDaListaDeContas(consulta: ConsultaDeContas): string {
  const parametros = new URLSearchParams({
    tipo: consulta.tipo,
    situacao: consulta.situacao,
    pagina: String(consulta.pagina),
  });
  if (consulta.busca.trim() !== "")
    parametros.set("busca", consulta.busca.trim());
  return `/api/admin/pessoas?${parametros.toString()}`;
}

export interface TabelaDeContasProps {
  readonly consulta: ConsultaDeContas;
  readonly termo: string;
  readonly estado: EstadoDasContas;
  readonly aoMudarTermo: (termo: string) => void;
  readonly aoBuscar: (evento: FormEvent<HTMLFormElement>) => void;
  readonly aoMudarTipo: (tipo: TipoDePessoa) => void;
  readonly aoMudarSituacao: (situacao: SituacaoDaPessoa) => void;
  readonly aoTentarDeNovo: () => void;
  readonly aoIrParaPagina: (pagina: number) => void;
}

const NOME_DO_TIPO: Readonly<Record<TipoDePessoa, string>> = {
  todas: "Todas as pessoas",
  clientes: "Clientes",
  donos: "Donos de loja",
  equipe: "Equipe das lojas",
};

export function TabelaDeContas(props: TabelaDeContasProps) {
  const { estado, consulta, termo } = props;
  const lista = estado.fase === "pronta" ? estado.lista : null;
  return (
    <section
      aria-labelledby="lista-de-contas"
      className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-5"
    >
      <h2 id="lista-de-contas" className="sc-so-leitor">
        Pessoas da plataforma
      </h2>
      <Cartao>
        <div className="grid gap-4">
          <PilulasDeFiltro
            rotulo="Tipo de pessoa"
            pilulas={TIPOS_DE_PESSOA.map((valor) => ({
              valor,
              rotulo: NOME_DO_TIPO[valor],
              quantidade: lista?.contagens[valor],
            }))}
            valor={consulta.tipo}
            aoEscolher={props.aoMudarTipo}
          />
          <PilulasDeFiltro
            rotulo="Situação da conta"
            pilulas={[
              { valor: "ativas", rotulo: "Ativas" },
              { valor: "desativadas", rotulo: "Desativadas" },
              { valor: "todas", rotulo: "Todas as situações" },
            ]}
            valor={consulta.situacao}
            aoEscolher={props.aoMudarSituacao}
          />
          <form
            role="search"
            onSubmit={props.aoBuscar}
            className="flex flex-wrap items-end gap-4"
          >
            <label
              className="grid min-w-[16rem] flex-1 gap-1 text-sm font-medium"
              htmlFor="busca-de-contas"
            >
              Buscar por nome ou e-mail
              <input
                id="busca-de-contas"
                name="busca"
                type="search"
                className="sc-campo__controle"
                value={termo}
                placeholder="Marina ou marina@…"
                autoComplete="off"
                onChange={(evento) => props.aoMudarTermo(evento.target.value)}
              />
            </label>
            <Botao type="submit" variante="secundaria" icone={<IconeBuscar />}>
              Buscar
            </Botao>
            <Link
              className="sc-botao sc-botao--primaria"
              href="/admin/contas/nova"
              prefetch={false}
            >
              Cadastrar pessoa
            </Link>
          </form>
        </div>
      </Cartao>

      {estado.fase === "erro" && (
        <Erro
          titulo="As pessoas não carregaram"
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
          titulo="Pessoas"
          estado="carregando"
          esperaComEsqueleto
          rotuloDeEspera="Carregando pessoas…"
        />
      )}
      {lista !== null && lista.pessoas.length === 0 && (
        <Cartao
          estado="vazio"
          tituloVazio="Nenhuma pessoa encontrada"
          descricaoVazio={
            consulta.busca.trim() === ""
              ? "Quando alguém criar uma conta ou você cadastrar uma pessoa, ela aparece aqui."
              : "Confira o nome ou o e-mail e busque de novo. O telefone não entra na busca."
          }
        />
      )}
      {lista !== null && lista.pessoas.length > 0 && (
        <PessoasProntas
          lista={lista}
          tipo={consulta.tipo}
          aoIrParaPagina={props.aoIrParaPagina}
        />
      )}
    </section>
  );
}

/** Os selos de tipo de uma pessoa: o que ela é nas lojas. */
export function SelosDoTipoDaPessoa({
  pessoa,
}: {
  readonly pessoa: Pick<
    ItemDePessoaNoContrato,
    "donoDeLojas" | "equipeDeLojas" | "protegida"
  >;
}) {
  const semVinculo = pessoa.donoDeLojas === 0 && pessoa.equipeDeLojas === 0;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {pessoa.donoDeLojas > 0 && (
        <Selo tom="info" semBolinha>
          Dono de {plural(pessoa.donoDeLojas, "loja", "lojas")}
        </Selo>
      )}
      {pessoa.equipeDeLojas > 0 && (
        <Selo tom="neutro" semBolinha>
          Equipe em {plural(pessoa.equipeDeLojas, "loja", "lojas")}
        </Selo>
      )}
      {semVinculo && !pessoa.protegida && (
        <Selo tom="neutro" semBolinha>
          Cliente
        </Selo>
      )}
      {pessoa.protegida && (
        <Selo tom="atencao" semBolinha>
          Conta protegida
        </Selo>
      )}
    </span>
  );
}

/** A situação da conta: desativada, ainda sem senha ou ativa. */
export function SeloDaSituacaoDaPessoa({
  pessoa,
}: {
  readonly pessoa: Pick<ItemDePessoaNoContrato, "desativada" | "temSenha">;
}) {
  if (pessoa.desativada) return <Selo tom="erro">Desativada</Selo>;
  if (!pessoa.temSenha) return <Selo tom="atencao">Sem senha ainda</Selo>;
  return <Selo tom="sucesso">Ativa</Selo>;
}

function PessoasProntas({
  lista,
  tipo,
  aoIrParaPagina,
}: {
  readonly lista: ListaDePessoasNoContrato;
  readonly tipo: TipoDePessoa;
  readonly aoIrParaPagina: (pagina: number) => void;
}) {
  const totalDePaginas = Math.max(1, Math.ceil(lista.total / lista.porPagina));
  const colunas: ColunaDaTabela<ItemDePessoaNoContrato>[] = [
    {
      chave: "pessoa",
      titulo: "Pessoa",
      celula: (pessoa) => (
        <>
          <Link
            className="font-medium text-[var(--cor-primaria-texto)] underline-offset-2 hover:underline"
            href={`/admin/contas/${pessoa.identidadeId}`}
            prefetch={false}
          >
            {pessoa.nome ?? pessoa.email}
          </Link>
          {pessoa.nome !== null && (
            <span className="block text-xs text-[var(--cor-tinta-suave)]">
              {pessoa.email}
            </span>
          )}
        </>
      ),
    },
    {
      chave: "tipo",
      titulo: "Tipo",
      celula: (pessoa) => <SelosDoTipoDaPessoa pessoa={pessoa} />,
    },
    {
      chave: "situacao",
      titulo: "Situação",
      celula: (pessoa) => <SeloDaSituacaoDaPessoa pessoa={pessoa} />,
    },
    {
      chave: "criadaEm",
      titulo: "Criada em",
      celula: (pessoa) => (
        <time dateTime={pessoa.criadaEm}>{dataCurta(pessoa.criadaEm)}</time>
      ),
    },
    {
      chave: "acoes",
      titulo: "Ações",
      celula: (pessoa) => (
        <Link
          className="text-sm font-medium text-[var(--cor-primaria-texto)] underline-offset-2 hover:underline"
          href={`/admin/contas/${pessoa.identidadeId}`}
          prefetch={false}
        >
          Abrir ficha
        </Link>
      ),
    },
  ];
  const resumo = plural(
    lista.total,
    "pessoa encontrada",
    "pessoas encontradas",
  );
  return (
    <div>
      <p role="status" className="sc-so-leitor">
        {resumo}.
      </p>
      <Cartao titulo={NOME_DO_TIPO[tipo]} descricao={`${resumo}.`}>
        <Tabela
          legenda={NOME_DO_TIPO[tipo]}
          legendaEscondida
          colunas={colunas}
          linhas={lista.pessoas}
          chaveDaLinha={(pessoa) => pessoa.identidadeId}
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

export function ListaDeContas() {
  const parametros = useSearchParams();
  const roteador = useRouter();
  const consulta = useMemo(
    () => consultaDeContasDoEndereco(parametros ?? new URLSearchParams()),
    [parametros],
  );
  const [termo, setTermo] = useState(consulta.busca);
  const [estado, setEstado] = useState<EstadoDasContas>({
    fase: "carregando",
  });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    setTermo(consulta.busca);
  }, [consulta.busca]);

  const carregar = useCallback(async () => {
    setEstado({ fase: "carregando" });
    const leitura: LeituraDaApi<ListaDePessoasNoContrato> = await lerDaApi(
      enderecoDaListaDeContas(consulta),
      (corpo) => esquemaDaListaDePessoas.parse(corpo),
      "Não foi possível carregar as pessoas agora. Tente de novo em instantes.",
    );
    setEstado(
      leitura.fase === "pronta"
        ? { fase: "pronta", lista: leitura.dados }
        : {
            fase: "erro",
            mensagem:
              leitura.fase === "erro"
                ? leitura.mensagem
                : "As pessoas não foram encontradas.",
          },
    );
  }, [consulta]);

  useEffect(() => {
    void carregar();
  }, [carregar, tentativa]);

  const ir = useCallback(
    (proxima: ConsultaDeContas) =>
      roteador.replace(enderecoDaPaginaDeContas(proxima), { scroll: false }),
    [roteador],
  );

  return (
    <TabelaDeContas
      consulta={consulta}
      termo={termo}
      estado={estado}
      aoMudarTermo={setTermo}
      aoBuscar={(evento) => {
        evento.preventDefault();
        ir({ ...consulta, busca: termo, pagina: 1 });
      }}
      aoMudarTipo={(tipo) => ir({ ...consulta, tipo, pagina: 1 })}
      aoMudarSituacao={(situacao) => ir({ ...consulta, situacao, pagina: 1 })}
      aoTentarDeNovo={() => setTentativa((n) => n + 1)}
      aoIrParaPagina={(pagina) => ir({ ...consulta, pagina })}
    />
  );
}
