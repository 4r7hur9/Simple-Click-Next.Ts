"use client";

/**
 * Lista e busca de lojas da administração (AC-206).
 *
 * Dois componentes, como no cadastro: `ListaLojas` guarda a consulta e fala
 * com a rede; `TabelaDeLojas` só desenha o que recebe — e é ela que a prova
 * confere nos quatro estados (P-011), sem navegador nem rede.
 *
 * A busca é UM campo só, de propósito: quem atende o telefone tem na mão um
 * nome, um CNPJ ou um código, e é a API que descobre qual dos três chegou.
 */

import {
  esquemaDaListaDeLojas,
  ROTULOS_DAS_SITUACOES,
  type ListaDeLojasNoContrato,
  type SituacaoDaLoja,
} from "@simpleclick/contracts";
import { Botao, Carregando, Erro, Vazio } from "@simpleclick/ui";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

export type EstadoDaLista =
  | { readonly fase: "carregando" }
  | { readonly fase: "erro"; readonly mensagem: string }
  | { readonly fase: "pronta"; readonly lista: ListaDeLojasNoContrato };

export interface TabelaDeLojasProps {
  readonly termo: string;
  readonly estado: EstadoDaLista;
  readonly aoMudarTermo: (termo: string) => void;
  readonly aoBuscar: (evento: FormEvent<HTMLFormElement>) => void;
  readonly aoTentarDeNovo: () => void;
  readonly aoIrParaPagina: (pagina: number) => void;
}

/** A data do cadastro como a administração a lê: dia/mês/ano, em Brasília. */
export function dataDeCadastro(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** A cor da situação diz de longe o que a palavra diz de perto. */
const CLASSE_DA_SITUACAO: Readonly<Record<SituacaoDaLoja, string>> = {
  ACTIVE: "bg-[var(--cor-sucesso-suave)] text-[var(--cor-sucesso)]",
  PENDING: "bg-[var(--cor-atencao-suave)] text-[var(--cor-atencao)]",
  SUSPENDED: "bg-[var(--cor-erro-suave)] text-[var(--cor-erro)]",
  DELETED: "bg-[var(--cor-superficie)] text-[var(--cor-tinta-suave)]",
};

export const MENSAGEM_DE_SESSAO =
  "Sua sessão não tem acesso à administração. Entre de novo.";
export const MENSAGEM_DE_FALHA =
  "Não foi possível carregar as lojas agora. Tente de novo em instantes.";

/** Só desenha. Nenhuma chamada de rede mora aqui. */
export function TabelaDeLojas(props: TabelaDeLojasProps) {
  const { estado, termo } = props;

  return (
    <section aria-labelledby="lista-de-lojas" className="mt-8">
      <form
        role="search"
        onSubmit={props.aoBuscar}
        className="flex flex-wrap items-end gap-3"
      >
        <label
          className="grid flex-1 gap-1 text-sm font-medium"
          htmlFor="busca-de-lojas"
        >
          Buscar por nome, CPF/CNPJ ou código
          <input
            id="busca-de-lojas"
            name="busca"
            type="search"
            className="sc-campo__controle"
            value={termo}
            placeholder="Pastel da Joi, 11.222.333/0001-81 ou 0002"
            autoComplete="off"
            onChange={(evento) => props.aoMudarTermo(evento.target.value)}
          />
        </label>
        <Botao type="submit" variante="secundaria">
          Buscar
        </Botao>
      </form>

      <h2 id="lista-de-lojas" className="sc-so-leitor">
        Lojas cadastradas
      </h2>

      {estado.fase === "carregando" && (
        <Carregando rotulo="Carregando lojas…" className="mt-6" />
      )}

      {estado.fase === "erro" && (
        <Erro
          titulo="A lista não carregou"
          mensagem={estado.mensagem}
          className="mt-6"
          acao={
            <Botao variante="secundaria" onClick={props.aoTentarDeNovo}>
              Tentar de novo
            </Botao>
          }
        />
      )}

      {estado.fase === "pronta" && estado.lista.lojas.length === 0 && (
        <Vazio
          titulo="Nenhuma loja encontrada"
          descricao={
            termo.trim() === ""
              ? "Cadastre a primeira loja da plataforma."
              : "Confira o nome, o documento ou o código e busque de novo."
          }
          className="mt-6"
          acao={
            <Link
              className="sc-botao sc-botao--primaria"
              href="/admin/lojas/nova"
            >
              Cadastrar loja
            </Link>
          }
        />
      )}

      {estado.fase === "pronta" && estado.lista.lojas.length > 0 && (
        <ListaPronta
          lista={estado.lista}
          aoIrParaPagina={props.aoIrParaPagina}
        />
      )}
    </section>
  );
}

function ListaPronta({
  lista,
  aoIrParaPagina,
}: {
  readonly lista: ListaDeLojasNoContrato;
  readonly aoIrParaPagina: (pagina: number) => void;
}) {
  const totalDePaginas = Math.max(1, Math.ceil(lista.total / lista.porPagina));
  return (
    <>
      <p role="status" className="mt-6 text-sm text-[var(--cor-tinta-suave)]">
        {lista.total === 1
          ? "1 loja encontrada."
          : `${lista.total} lojas encontradas.`}
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sc-so-leitor">
            Lojas cadastradas, da mais recente para a mais antiga
          </caption>
          <thead>
            <tr className="border-b border-[var(--cor-borda)] text-xs uppercase tracking-[0.12em] text-[var(--cor-tinta-suave)]">
              <th scope="col" className="py-2 pr-4">
                Código
              </th>
              <th scope="col" className="py-2 pr-4">
                Loja
              </th>
              <th scope="col" className="py-2 pr-4">
                Tipo de negócio
              </th>
              <th scope="col" className="py-2 pr-4">
                Situação
              </th>
              <th scope="col" className="py-2">
                Cadastro
              </th>
            </tr>
          </thead>
          <tbody>
            {lista.lojas.map((loja) => (
              <tr
                key={loja.id}
                className="border-b border-[var(--cor-borda)] align-top"
              >
                <td className="py-3 pr-4 font-mono">{loja.codigo}</td>
                <td className="py-3 pr-4">
                  <Link
                    className="font-medium text-[var(--cor-primaria)] underline-offset-2 hover:underline"
                    href={`/admin/lojas/${loja.id}`}
                  >
                    {loja.nome}
                  </Link>
                  <span className="block text-xs text-[var(--cor-tinta-suave)]">
                    /l/{loja.apelido}
                    {loja.cidade !== null && loja.uf !== null
                      ? ` · ${loja.cidade}/${loja.uf}`
                      : ""}
                  </span>
                </td>
                <td className="py-3 pr-4">{loja.tipoDeNegocio.nome}</td>
                <td className="py-3 pr-4">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${CLASSE_DA_SITUACAO[loja.status]}`}
                  >
                    {ROTULOS_DAS_SITUACOES[loja.status]}
                  </span>
                </td>
                <td className="py-3">
                  <time dateTime={loja.criadaEm}>
                    {dataDeCadastro(loja.criadaEm)}
                  </time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalDePaginas > 1 && (
        <nav
          aria-label="Páginas da lista"
          className="mt-4 flex items-center gap-3 text-sm"
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
    </>
  );
}

/** O endereço que a tela consulta no próprio site, com a consulta montada. */
export function enderecoDaLista(consulta: {
  readonly busca: string;
  readonly pagina: number;
}): string {
  const parametros = new URLSearchParams({ pagina: String(consulta.pagina) });
  if (consulta.busca.trim() !== "")
    parametros.set("busca", consulta.busca.trim());
  return `/api/admin/lojas?${parametros.toString()}`;
}

/** Estado e rede. O desenho é todo de `TabelaDeLojas`. */
export function ListaLojas() {
  const [termo, setTermo] = useState("");
  const [consulta, setConsulta] = useState({ busca: "", pagina: 1 });
  const [estado, setEstado] = useState<EstadoDaLista>({ fase: "carregando" });
  // Tentar de novo repete a MESMA consulta; sem este contador, o efeito não
  // teria como saber que a pessoa pediu para repetir.
  const [tentativa, setTentativa] = useState(0);

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

  return (
    <TabelaDeLojas
      termo={termo}
      estado={estado}
      aoMudarTermo={setTermo}
      aoBuscar={(evento) => {
        evento.preventDefault();
        setConsulta({ busca: termo, pagina: 1 });
      }}
      aoTentarDeNovo={() => setTentativa((anterior) => anterior + 1)}
      aoIrParaPagina={(pagina) =>
        setConsulta((anterior) => ({ ...anterior, pagina }))
      }
    />
  );
}
