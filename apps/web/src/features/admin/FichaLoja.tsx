"use client";

/**
 * A ficha da loja na administração (AC-207).
 *
 * `FichaLoja` busca e guarda o estado; `FichaDaLojaNaTela` só desenha — e é
 * ela que a prova confere nos quatro estados (P-011). O formulário do
 * cadastro manda à API SÓ O QUE MUDOU, validado antes pelo mesmo contrato que
 * a API aplica; a resposta é a ficha nova, com a alteração já no topo do
 * histórico.
 *
 * Nada aqui decide quem pode ver a ficha: é a API, com a credencial própria
 * da administração, e cada abertura fica registrada na trilha (AC-118).
 */

import {
  esquemaDaFichaDaLoja,
  esquemaDaRecusaDeCadastro,
  ROTULOS_DAS_SITUACOES,
  UNIDADES_DA_FEDERACAO,
  type FichaDaLojaNoContrato,
} from "@simpleclick/contracts";
import {
  Botao,
  Campo,
  Carregando,
  Erro,
  Sucesso,
  Vazio,
} from "@simpleclick/ui";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  edicaoDoFormulario,
  errosDaEdicao,
  validarEdicao,
  valoresDaFicha,
  type CampoDaEdicao,
  type ErrosDaEdicao,
  type ValoresDaEdicao,
} from "./edicao-da-loja.ts";
import { ListaDaTrilha } from "./ListaDaTrilha.tsx";

export type EstadoDaFicha =
  | { readonly fase: "carregando" }
  | { readonly fase: "nao-encontrada" }
  | { readonly fase: "erro"; readonly mensagem: string }
  | { readonly fase: "pronta"; readonly ficha: FichaDaLojaNoContrato };

export const MENSAGEM_DE_SESSAO_DA_FICHA =
  "Sua sessão não tem acesso à administração. Entre de novo.";
export const MENSAGEM_DE_FALHA_DA_FICHA =
  "Não foi possível carregar a ficha agora. Tente de novo em instantes.";

/** O endereço da ficha no próprio site. */
export function enderecoDaFicha(lojaId: string): string {
  return `/api/admin/lojas/${encodeURIComponent(lojaId)}`;
}

// ---------------------------------------------------------------------------
// O formulário do cadastro
// ---------------------------------------------------------------------------

type EstadoDoSalvamento =
  | { readonly estado: "parado" }
  | { readonly estado: "salvando" }
  | { readonly estado: "salvo" }
  | { readonly estado: "sem-mudanca" }
  | { readonly estado: "falhou"; readonly mensagem: string };

const idDoCampo = (campo: CampoDaEdicao) => `ficha-${campo}`;

/**
 * O formulário do cadastro, com estado próprio: a ficha que chega é o ponto
 * de partida, e a que a API devolve depois de salvar vira o novo ponto.
 */
export function CadastroDaLoja({
  ficha,
  aoSalvar,
}: {
  readonly ficha: FichaDaLojaNoContrato;
  readonly aoSalvar: (ficha: FichaDaLojaNoContrato) => void;
}) {
  const original = valoresDaFicha(ficha);
  const [valores, setValores] = useState<ValoresDaEdicao>(original);
  const [erros, setErros] = useState<ErrosDaEdicao>({});
  const [salvamento, setSalvamento] = useState<EstadoDoSalvamento>({
    estado: "parado",
  });

  function aoMudar(campo: CampoDaEdicao, valor: string) {
    setValores((anteriores) => ({ ...anteriores, [campo]: valor }));
    setErros((anteriores) => ({ ...anteriores, [campo]: undefined }));
  }

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const edicao = edicaoDoFormulario(original, valores);
    if (edicao === null) {
      setSalvamento({ estado: "sem-mudanca" });
      return;
    }
    const validacao = validarEdicao(edicao);
    if (!validacao.ok) {
      // A recusa acontece antes de qualquer envio.
      setErros(validacao.erros);
      setSalvamento({ estado: "parado" });
      return;
    }

    setSalvamento({ estado: "salvando" });
    try {
      const resposta = await fetch(enderecoDaFicha(ficha.id), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(edicao),
      });
      const corpo: unknown = await resposta.json().catch(() => null);
      if (resposta.ok) {
        const nova = esquemaDaFichaDaLoja.parse(corpo);
        setValores(valoresDaFicha(nova));
        setSalvamento({ estado: "salvo" });
        aoSalvar(nova);
        return;
      }
      const recusa = esquemaDaRecusaDeCadastro.safeParse(corpo);
      if (resposta.status === 400 && recusa.success) {
        setErros(errosDaEdicao(recusa.data.campos));
        setSalvamento({ estado: "parado" });
        return;
      }
      setSalvamento({
        estado: "falhou",
        mensagem:
          resposta.status === 401 || resposta.status === 403
            ? MENSAGEM_DE_SESSAO_DA_FICHA
            : "Não foi possível salvar agora. Nada foi alterado; tente de novo.",
      });
    } catch {
      setSalvamento({
        estado: "falhou",
        mensagem:
          "Não foi possível salvar agora. Nada foi alterado; tente de novo.",
      });
    }
  }

  const texto = (
    campo: CampoDaEdicao,
    rotulo: string,
    extra: {
      readonly obrigatorio?: boolean;
      readonly tipo?: string;
      readonly inputMode?: "numeric" | "tel" | "email" | "text";
      readonly dica?: string;
    } = {},
  ) => (
    <Campo
      id={idDoCampo(campo)}
      name={campo}
      rotulo={rotulo}
      value={valores[campo]}
      erro={erros[campo]}
      dica={extra.dica}
      obrigatorio={extra.obrigatorio ?? false}
      type={extra.tipo ?? "text"}
      autoComplete="off"
      inputMode={extra.inputMode}
      onChange={(evento) => aoMudar(campo, evento.target.value)}
    />
  );

  return (
    <form
      noValidate
      onSubmit={aoEnviar}
      aria-label="Cadastro da loja"
      className="grid gap-6"
    >
      {salvamento.estado === "falhou" && (
        <Erro
          titulo="O cadastro não foi salvo"
          mensagem={salvamento.mensagem}
        />
      )}
      {salvamento.estado === "salvo" && (
        <Sucesso
          titulo="Cadastro salvo"
          descricao="A alteração ficou registrada no histórico com o seu nome."
        />
      )}
      {salvamento.estado === "sem-mudanca" && (
        <p role="status" className="text-sm">
          Nada mudou: não há o que salvar.
        </p>
      )}

      <fieldset className="grid gap-4">
        <legend className="text-lg font-semibold">O negócio</legend>
        {texto("nome", "Nome da loja ou razão social", { obrigatorio: true })}
        {texto("razaoSocial", "Razão social (se diferente do nome)")}
        {texto("documento", "CPF ou CNPJ", {
          obrigatorio: true,
          inputMode: "numeric",
          dica: "Pode digitar com ou sem pontos, barra e hífen.",
        })}
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="text-lg font-semibold">Contato</legend>
        {texto("email", "E-mail", { tipo: "email", inputMode: "email" })}
        {texto("telefone", "Telefone com DDD", {
          tipo: "tel",
          inputMode: "tel",
        })}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="text-lg font-semibold">Endereço</legend>
        {texto("cep", "CEP", { inputMode: "numeric" })}
        {texto("logradouro", "Logradouro")}
        {texto("numero", "Número")}
        {texto("complemento", "Complemento")}
        {texto("bairro", "Bairro")}
        {texto("cidade", "Cidade")}
        <Campo
          id={idDoCampo("uf")}
          rotulo="UF"
          erro={erros.uf}
          controle={
            <select
              id={idDoCampo("uf")}
              name="uf"
              className="sc-campo__controle"
              value={valores.uf}
              aria-invalid={erros.uf !== undefined || undefined}
              aria-describedby={
                erros.uf !== undefined ? `${idDoCampo("uf")}-erro` : undefined
              }
              onChange={(evento) => aoMudar("uf", evento.target.value)}
            >
              <option value="">Escolha…</option>
              {UNIDADES_DA_FEDERACAO.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          }
        />
      </fieldset>

      <div>
        <Botao
          type="submit"
          carregando={salvamento.estado === "salvando"}
          rotuloDeEspera="Salvando…"
        >
          Salvar cadastro
        </Botao>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// A ficha
// ---------------------------------------------------------------------------

export interface FichaDaLojaNaTelaProps {
  readonly estado: EstadoDaFicha;
  readonly aoTentarDeNovo: () => void;
  readonly aoAtualizar: (ficha: FichaDaLojaNoContrato) => void;
}

function Secao({
  id,
  titulo,
  children,
}: {
  readonly id: string;
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="text-2xl font-semibold tracking-[-0.02em]">
        {titulo}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Só desenha. Nenhuma chamada de rede mora aqui, fora do formulário. */
export function FichaDaLojaNaTela(props: FichaDaLojaNaTelaProps) {
  const { estado } = props;

  if (estado.fase === "carregando") {
    return <Carregando rotulo="Carregando a ficha da loja…" className="mt-8" />;
  }
  if (estado.fase === "nao-encontrada") {
    return (
      <Vazio
        titulo="Loja não encontrada"
        descricao="O endereço não corresponde a nenhuma loja cadastrada."
        className="mt-8"
        acao={
          <Link className="sc-botao sc-botao--primaria" href="/admin/lojas">
            Voltar para as lojas
          </Link>
        }
      />
    );
  }
  if (estado.fase === "erro") {
    return (
      <Erro
        titulo="A ficha não carregou"
        mensagem={estado.mensagem}
        className="mt-8"
        acao={
          <Botao variante="secundaria" onClick={props.aoTentarDeNovo}>
            Tentar de novo
          </Botao>
        }
      />
    );
  }

  const { ficha } = estado;
  return (
    <article aria-labelledby="ficha-titulo" className="mt-6">
      <header>
        <p className="font-mono text-sm text-[var(--cor-tinta-suave)]">
          Código {ficha.codigo} · /l/{ficha.apelido}
        </p>
        <h1
          id="ficha-titulo"
          className="mt-2 text-4xl font-semibold tracking-[-0.04em]"
        >
          {ficha.nome}
        </h1>
        <p className="mt-2 text-lg">
          {ficha.tipoDeNegocio.nome} · {ROTULOS_DAS_SITUACOES[ficha.status]}
        </p>
      </header>

      <Secao id="ficha-cadastro" titulo="Cadastro">
        <CadastroDaLoja ficha={ficha} aoSalvar={props.aoAtualizar} />
      </Secao>

      <Secao id="ficha-historico" titulo="Histórico de alterações">
        {ficha.historico.length === 0 ? (
          <p className="text-sm">Nenhuma alteração registrada ainda.</p>
        ) : (
          <ListaDaTrilha registros={ficha.historico} />
        )}
      </Secao>
    </article>
  );
}

/** Estado e rede. O desenho é todo de `FichaDaLojaNaTela`. */
export function FichaLoja({ lojaId }: { readonly lojaId: string }) {
  const [estado, setEstado] = useState<EstadoDaFicha>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  const carregar = useCallback(async () => {
    setEstado({ fase: "carregando" });
    try {
      const resposta = await fetch(enderecoDaFicha(lojaId), {
        cache: "no-store",
      });
      if (resposta.status === 404) {
        setEstado({ fase: "nao-encontrada" });
        return;
      }
      if (resposta.status === 401 || resposta.status === 403) {
        setEstado({ fase: "erro", mensagem: MENSAGEM_DE_SESSAO_DA_FICHA });
        return;
      }
      if (!resposta.ok) {
        setEstado({ fase: "erro", mensagem: MENSAGEM_DE_FALHA_DA_FICHA });
        return;
      }
      const ficha = esquemaDaFichaDaLoja.parse(await resposta.json());
      setEstado({ fase: "pronta", ficha });
    } catch {
      setEstado({ fase: "erro", mensagem: MENSAGEM_DE_FALHA_DA_FICHA });
    }
  }, [lojaId]);

  useEffect(() => {
    void carregar();
  }, [carregar, tentativa]);

  return (
    <FichaDaLojaNaTela
      estado={estado}
      aoTentarDeNovo={() => setTentativa((anterior) => anterior + 1)}
      aoAtualizar={(ficha) => setEstado({ fase: "pronta", ficha })}
    />
  );
}
