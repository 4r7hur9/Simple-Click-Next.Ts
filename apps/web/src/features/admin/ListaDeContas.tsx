"use client";

/**
 * As contas da plataforma na administração (card #29): donos de um lado,
 * equipe do outro. Mostra quantas lojas cada dono tem contra o limite dele e
 * quantas estão esperando aprovação. A consulta mora no endereço da página
 * (`?tipo=equipe&busca=`), como a lista de lojas.
 *
 * `TabelaDeContas` só desenha; `ListaDeContas` guarda a consulta e fala com a
 * rede.
 */

import {
  esquemaDaListaDeContas,
  type ContaNaAdministracaoNoContrato,
  type ListaDeContasNoContrato,
  type TipoDeContaNaAdministracao,
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
  readonly tipo: TipoDeContaNaAdministracao;
  readonly busca: string;
  readonly pagina: number;
}

export type EstadoDasContas =
  | { readonly fase: "carregando" }
  | { readonly fase: "erro"; readonly mensagem: string }
  | { readonly fase: "pronta"; readonly lista: ListaDeContasNoContrato };

export function consultaDeContasDoEndereco(
  parametros: Pick<URLSearchParams, "get">,
): ConsultaDeContas {
  const pagina = Number.parseInt(parametros.get("pagina") ?? "1", 10);
  return {
    tipo: parametros.get("tipo") === "equipe" ? "equipe" : "donos",
    busca: parametros.get("busca") ?? "",
    pagina: Number.isFinite(pagina) && pagina >= 1 ? pagina : 1,
  };
}

export function enderecoDaPaginaDeContas(consulta: ConsultaDeContas): string {
  const parametros = new URLSearchParams();
  if (consulta.tipo === "equipe") parametros.set("tipo", "equipe");
  if (consulta.busca.trim() !== "")
    parametros.set("busca", consulta.busca.trim());
  if (consulta.pagina > 1) parametros.set("pagina", String(consulta.pagina));
  const texto = parametros.toString();
  return texto === "" ? "/admin/contas" : `/admin/contas?${texto}`;
}

export function enderecoDaListaDeContas(consulta: ConsultaDeContas): string {
  const parametros = new URLSearchParams({
    tipo: consulta.tipo,
    pagina: String(consulta.pagina),
  });
  if (consulta.busca.trim() !== "")
    parametros.set("busca", consulta.busca.trim());
  return `/api/admin/contas?${parametros.toString()}`;
}

export interface TabelaDeContasProps {
  readonly consulta: ConsultaDeContas;
  readonly termo: string;
  readonly estado: EstadoDasContas;
  readonly aoMudarTermo: (termo: string) => void;
  readonly aoBuscar: (evento: FormEvent<HTMLFormElement>) => void;
  readonly aoMudarTipo: (tipo: TipoDeContaNaAdministracao) => void;
  readonly aoTentarDeNovo: () => void;
  readonly aoIrParaPagina: (pagina: number) => void;
}

export function TabelaDeContas(props: TabelaDeContasProps) {
  const { estado, consulta, termo } = props;
  const lista = estado.fase === "pronta" ? estado.lista : null;
  return (
    <section
      aria-labelledby="lista-de-contas"
      className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-5"
    >
      <h2 id="lista-de-contas" className="sc-so-leitor">
        Contas da plataforma
      </h2>
      <Cartao>
        <div className="grid gap-4">
          <PilulasDeFiltro
            rotulo="Tipo de conta"
            pilulas={[
              {
                valor: "donos",
                rotulo: "Donos de loja",
                quantidade: lista?.contagens.donos,
              },
              {
                valor: "equipe",
                rotulo: "Equipe das lojas",
                quantidade: lista?.contagens.equipe,
              },
            ]}
            valor={consulta.tipo}
            aoEscolher={props.aoMudarTipo}
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
              Buscar por nome, e-mail ou telefone
              <input
                id="busca-de-contas"
                name="busca"
                type="search"
                className="sc-campo__controle"
                value={termo}
                placeholder="Marina, marina@… ou 11 91111-0001"
                autoComplete="off"
                onChange={(evento) => props.aoMudarTermo(evento.target.value)}
              />
            </label>
            <Botao type="submit" variante="secundaria" icone={<IconeBuscar />}>
              Buscar
            </Botao>
          </form>
        </div>
      </Cartao>

      {estado.fase === "erro" && (
        <Erro
          titulo="As contas não carregaram"
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
          titulo="Contas"
          estado="carregando"
          esperaComEsqueleto
          rotuloDeEspera="Carregando contas…"
        />
      )}
      {lista !== null && lista.contas.length === 0 && (
        <Cartao
          estado="vazio"
          tituloVazio="Nenhuma conta encontrada"
          descricaoVazio={
            consulta.busca.trim() === ""
              ? consulta.tipo === "donos"
                ? "Quando alguém abrir uma loja, a conta do dono aparece aqui."
                : "Quando um dono adicionar alguém à equipe, a conta aparece aqui."
              : "Confira o nome, o e-mail ou o telefone e busque de novo."
          }
        />
      )}
      {lista !== null && lista.contas.length > 0 && (
        <ContasProntas
          lista={lista}
          tipo={consulta.tipo}
          aoIrParaPagina={props.aoIrParaPagina}
        />
      )}
    </section>
  );
}

function ContasProntas({
  lista,
  tipo,
  aoIrParaPagina,
}: {
  readonly lista: ListaDeContasNoContrato;
  readonly tipo: TipoDeContaNaAdministracao;
  readonly aoIrParaPagina: (pagina: number) => void;
}) {
  const totalDePaginas = Math.max(1, Math.ceil(lista.total / lista.porPagina));
  const colunas: ColunaDaTabela<ContaNaAdministracaoNoContrato>[] = [
    {
      chave: "conta",
      titulo: "Conta",
      celula: (conta) => (
        <>
          <Link
            className="font-medium text-[var(--cor-primaria-texto)] underline-offset-2 hover:underline"
            href={`/admin/contas/${conta.identidadeId}`}
          >
            {conta.nome ?? conta.email}
          </Link>
          {conta.nome !== null && (
            <span className="block text-xs text-[var(--cor-tinta-suave)]">
              {conta.email}
            </span>
          )}
        </>
      ),
    },
  ];
  if (tipo === "donos") {
    colunas.push({
      chave: "limite",
      titulo: "Lojas / limite",
      celula: (conta) => (
        <span className="tabular-nums">
          {conta.lojasEmUso} de {conta.limiteDeLojas ?? "—"}
        </span>
      ),
    });
  }
  colunas.push(
    {
      chave: "lojas",
      titulo: "Lojas",
      celula: (conta) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {conta.lojas.slice(0, 2).map((loja) => (
            <Link
              key={loja.id}
              className="underline-offset-2 hover:underline"
              href={`/admin/lojas/${loja.id}`}
            >
              {loja.nome}
            </Link>
          ))}
          {conta.lojas.length > 2 && (
            <span className="text-xs text-[var(--cor-tinta-suave)]">
              +{conta.lojas.length - 2}
            </span>
          )}
        </span>
      ),
    },
    {
      chave: "pendentes",
      titulo: "Pendentes",
      celula: (conta) =>
        conta.pendentes > 0 ? (
          <Link
            href={`/admin/contas/${conta.identidadeId}`}
            // O nome acessível COMEÇA pelo texto do selo ("1 pendente"): quem
            // usa comando de voz fala o que vê (axe label-content-name-mismatch).
            aria-label={`${plural(conta.pendentes, "pendente", "pendentes")} de aprovação, nas lojas de ${conta.nome ?? conta.email}`}
          >
            <Selo tom="atencao">
              {plural(conta.pendentes, "pendente", "pendentes")}
            </Selo>
          </Link>
        ) : (
          <span className="text-[var(--cor-tinta-suave)]">—</span>
        ),
    },
    {
      chave: "criadaEm",
      titulo: "Criada em",
      celula: (conta) => (
        <time dateTime={conta.criadaEm}>{dataCurta(conta.criadaEm)}</time>
      ),
    },
    {
      chave: "acoes",
      titulo: "Ações",
      celula: (conta) => (
        <Link
          className="text-sm font-medium text-[var(--cor-primaria-texto)] underline-offset-2 hover:underline"
          href={`/admin/contas/${conta.identidadeId}`}
        >
          Abrir conta
        </Link>
      ),
    },
  );
  const resumo = plural(lista.total, "conta encontrada", "contas encontradas");
  return (
    <div>
      <p role="status" className="sc-so-leitor">
        {resumo}.
      </p>
      <Cartao
        titulo={tipo === "donos" ? "Donos de loja" : "Equipe das lojas"}
        descricao={`${resumo}.`}
      >
        <Tabela
          legenda={tipo === "donos" ? "Donos de loja" : "Equipe das lojas"}
          legendaEscondida
          colunas={colunas}
          linhas={lista.contas}
          chaveDaLinha={(conta) => conta.identidadeId}
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
    const leitura: LeituraDaApi<ListaDeContasNoContrato> = await lerDaApi(
      enderecoDaListaDeContas(consulta),
      (corpo) => esquemaDaListaDeContas.parse(corpo),
      "Não foi possível carregar as contas agora. Tente de novo em instantes.",
    );
    setEstado(
      leitura.fase === "pronta"
        ? { fase: "pronta", lista: leitura.dados }
        : {
            fase: "erro",
            mensagem:
              leitura.fase === "erro"
                ? leitura.mensagem
                : "As contas não foram encontradas.",
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
      aoTentarDeNovo={() => setTentativa((n) => n + 1)}
      aoIrParaPagina={(pagina) => ir({ ...consulta, pagina })}
    />
  );
}
