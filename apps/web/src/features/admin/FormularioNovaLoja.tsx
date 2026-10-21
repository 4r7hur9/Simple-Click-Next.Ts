"use client";

/**
 * Formulário de cadastro de loja da administração (AC-200..AC-202).
 *
 * Dois componentes, de propósito: `FormularioNovaLoja` guarda o estado e fala
 * com a rede; `CamposDaNovaLoja` só desenha o que recebe. A parte que desenha
 * é a que a prova confere — carregando, erro por campo, sugestão de apelido,
 * sucesso — sem precisar de navegador nem de rede.
 */

import {
  esquemaDaLojaCriada,
  esquemaDaRecusaDeCadastro,
  esquemaDosTiposDeNegocio,
  UNIDADES_DA_FEDERACAO,
  type LojaCriadaNoContrato,
  type TipoDeNegocioNoContrato,
} from "@simpleclick/contracts";
import {
  Botao,
  Campo,
  Carregando,
  descritoresDoCampo,
  Erro,
  Seletor,
  Sucesso,
  type ConteudoDoInfo,
} from "@simpleclick/ui";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import {
  apelidoAPartirDoNome,
  errosPorCampo,
  montarCadastro,
  primeiroCampoComErro,
  validarNovaLoja,
  VALORES_INICIAIS,
  type CampoDaNovaLoja,
  type ErrosDaNovaLoja,
  type ValoresDaNovaLoja,
} from "./formulario-da-loja.ts";
import {
  INFO_DO_APELIDO,
  INFO_DO_DOCUMENTO,
  INFO_DO_TIPO_DE_NEGOCIO,
} from "./explicacoes.ts";

export type EstadoDosTipos =
  | { readonly estado: "carregando" }
  | { readonly estado: "erro" }
  | {
      readonly estado: "pronto";
      readonly tipos: readonly TipoDeNegocioNoContrato[];
    };

export type EstadoDoEnvio =
  | { readonly estado: "parado" }
  | { readonly estado: "enviando" }
  | {
      readonly estado: "criada";
      readonly loja: LojaCriadaNoContrato;
      readonly email: string;
    }
  | { readonly estado: "falhou"; readonly mensagem: string };

export interface CamposDaNovaLojaProps {
  readonly valores: ValoresDaNovaLoja;
  readonly erros: ErrosDaNovaLoja;
  readonly sugestao: string | null;
  readonly tipos: EstadoDosTipos;
  readonly envio: EstadoDoEnvio;
  readonly aoMudar: (campo: CampoDaNovaLoja, valor: string) => void;
  readonly aoEnviar: (evento: FormEvent<HTMLFormElement>) => void;
  readonly aoUsarSugestao: () => void;
  readonly aoRecarregarTipos: () => void;
  readonly aoRecomecar: () => void;
}

const idDoCampo = (campo: CampoDaNovaLoja) => `nova-loja-${campo}`;

/** Só desenha. Nenhuma chamada de rede mora aqui. */
export function CamposDaNovaLoja(props: CamposDaNovaLojaProps) {
  const { valores, erros, envio } = props;

  if (envio.estado === "criada") {
    return (
      <Sucesso
        titulo={`Loja criada com o código ${envio.loja.codigo}`}
        descricao={
          envio.loja.conviteEnviado
            ? `O convite para definir a senha foi enviado para ${envio.email}.`
            : "A loja foi criada, mas o convite ainda não saiu. Reenvie pela ficha da loja."
        }
        acao={
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              className="sc-botao sc-botao--primaria"
              href={`/admin/lojas/${envio.loja.id}`}
            >
              Abrir a ficha da loja
            </Link>
            <Botao variante="secundaria" onClick={props.aoRecomecar}>
              Cadastrar outra loja
            </Botao>
          </div>
        }
      />
    );
  }

  const texto = (
    campo: CampoDaNovaLoja,
    rotulo: string,
    extra: {
      obrigatorio?: boolean;
      dica?: string;
      info?: ConteudoDoInfo;
      tipo?: string;
      autoComplete?: string;
      inputMode?: "numeric" | "tel" | "email" | "text";
    } = {},
  ) => (
    <Campo
      id={idDoCampo(campo)}
      name={campo}
      rotulo={rotulo}
      value={valores[campo]}
      erro={erros[campo]}
      dica={extra.dica}
      info={extra.info}
      obrigatorio={extra.obrigatorio ?? true}
      type={extra.tipo ?? "text"}
      autoComplete={extra.autoComplete ?? "off"}
      inputMode={extra.inputMode}
      onChange={(evento) => props.aoMudar(campo, evento.target.value)}
    />
  );

  const seletor = (
    campo: "tipoDeNegocio" | "uf",
    rotulo: string,
    opcoes: readonly { readonly valor: string; readonly nome: string }[],
    info?: ConteudoDoInfo,
  ) => (
    <Campo
      id={idDoCampo(campo)}
      rotulo={rotulo}
      erro={erros[campo]}
      info={info}
      obrigatorio
      controle={
        <Seletor
          id={idDoCampo(campo)}
          name={campo}
          required
          value={valores[campo]}
          aria-invalid={erros[campo] !== undefined || undefined}
          aria-describedby={
            descritoresDoCampo(idDoCampo(campo), {
              info: info !== undefined,
              erro: erros[campo],
            }).join(" ") || undefined
          }
          onChange={(valor) => props.aoMudar(campo, valor)}
        >
          <option value="">Escolha…</option>
          {opcoes.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.nome}
            </option>
          ))}
        </Seletor>
      }
    />
  );

  return (
    <form
      noValidate
      onSubmit={props.aoEnviar}
      className="mt-8 grid max-w-3xl gap-8"
      aria-label="Cadastro de loja"
    >
      {envio.estado === "falhou" && (
        <Erro titulo="A loja não foi criada" mensagem={envio.mensagem} />
      )}

      <fieldset className="grid gap-4">
        <legend className="text-xl font-semibold">O negócio</legend>
        {texto("nome", "Nome da loja ou razão social")}
        {texto("razaoSocial", "Razão social (se diferente do nome)", {
          obrigatorio: false,
        })}
        {texto("documento", "CPF ou CNPJ", {
          inputMode: "numeric",
          dica: "Pode digitar com ou sem pontos, barra e hífen.",
          info: INFO_DO_DOCUMENTO,
        })}
        {props.tipos.estado === "carregando" && (
          <Carregando rotulo="Carregando os tipos de negócio…" />
        )}
        {props.tipos.estado === "erro" && (
          <Erro
            titulo="Os tipos de negócio não carregaram"
            mensagem="Sem eles não dá para escolher o ramo da loja."
            acao={
              <Botao variante="secundaria" onClick={props.aoRecarregarTipos}>
                Tentar de novo
              </Botao>
            }
          />
        )}
        {props.tipos.estado === "pronto" &&
          seletor(
            "tipoDeNegocio",
            "Tipo de negócio",
            props.tipos.tipos.map((tipo) => ({
              valor: tipo.codigo,
              nome: tipo.nome,
            })),
            INFO_DO_TIPO_DE_NEGOCIO,
          )}
        {texto("apelido", "Endereço da loja na web (apelido)", {
          dica: `simpleclick.app/loja/${valores.apelido || "nome-da-loja"} — letras minúsculas, números e hífen.`,
          info: INFO_DO_APELIDO,
        })}
        {props.sugestao !== null && (
          <p className="text-sm">
            Sugestão livre:{" "}
            <Botao
              variante="discreta"
              tamanho="pequeno"
              onClick={props.aoUsarSugestao}
            >
              usar {props.sugestao}
            </Botao>
          </p>
        )}
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="text-xl font-semibold">Responsável</legend>
        {texto("responsavelNome", "Nome do responsável")}
        {texto("responsavelEmail", "E-mail do responsável", {
          tipo: "email",
          inputMode: "email",
          dica: "É para este e-mail que vai o convite para definir a senha.",
        })}
        {texto("responsavelTelefone", "Telefone com DDD", {
          tipo: "tel",
          inputMode: "tel",
          dica: "Ex.: (85) 99999-0000.",
        })}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="text-xl font-semibold">Endereço da loja</legend>
        {texto("cep", "CEP", {
          inputMode: "numeric",
          dica: "8 números. Ex.: 60115-000.",
        })}
        {texto("logradouro", "Logradouro")}
        {texto("numero", "Número", { dica: "Sem número? Escreva S/N." })}
        {texto("complemento", "Complemento", { obrigatorio: false })}
        {texto("bairro", "Bairro")}
        {texto("cidade", "Cidade")}
        {seletor(
          "uf",
          "Estado (UF)",
          UNIDADES_DA_FEDERACAO.map((uf) => ({ valor: uf, nome: uf })),
        )}
      </fieldset>

      <div>
        <Botao
          type="submit"
          carregando={envio.estado === "enviando"}
          rotuloDeEspera="Criando a loja…"
        >
          Criar loja e enviar convite
        </Botao>
      </div>
    </form>
  );
}

/** Estado e rede. O desenho é todo de `CamposDaNovaLoja`. */
export function FormularioNovaLoja() {
  const [valores, setValores] = useState(VALORES_INICIAIS);
  const [erros, setErros] = useState<ErrosDaNovaLoja>({});
  const [sugestao, setSugestao] = useState<string | null>(null);
  const [tipos, setTipos] = useState<EstadoDosTipos>({ estado: "carregando" });
  const [envio, setEnvio] = useState<EstadoDoEnvio>({ estado: "parado" });
  const [apelidoTocado, setApelidoTocado] = useState(false);

  const carregarTipos = useCallback(async () => {
    setTipos({ estado: "carregando" });
    try {
      const resposta = await fetch("/api/admin/tipos-de-negocio", {
        cache: "no-store",
      });
      if (!resposta.ok) throw new Error(String(resposta.status));
      const lidos = esquemaDosTiposDeNegocio.parse(await resposta.json());
      setTipos({ estado: "pronto", tipos: lidos.tipos });
    } catch {
      setTipos({ estado: "erro" });
    }
  }, []);

  useEffect(() => {
    void carregarTipos();
  }, [carregarTipos]);

  function focar(campo: CampoDaNovaLoja | undefined) {
    if (campo === undefined) return;
    document.getElementById(`nova-loja-${campo}`)?.focus();
  }

  function aoMudar(campo: CampoDaNovaLoja, valor: string) {
    setValores((anteriores) => {
      const proximos = { ...anteriores, [campo]: valor };
      // O apelido acompanha o nome até a pessoa mexer nele.
      if (campo === "nome" && !apelidoTocado) {
        return { ...proximos, apelido: apelidoAPartirDoNome(valor) };
      }
      return proximos;
    });
    if (campo === "apelido") {
      setApelidoTocado(true);
      setSugestao(null);
    }
    setErros((anteriores) => ({ ...anteriores, [campo]: undefined }));
  }

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const validacao = validarNovaLoja(valores);
    if (!validacao.ok) {
      // Nada sai da tela: a recusa acontece antes de qualquer gravação.
      setErros(validacao.erros);
      focar(primeiroCampoComErro(validacao.erros));
      return;
    }

    setEnvio({ estado: "enviando" });
    try {
      const resposta = await fetch("/api/admin/lojas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(montarCadastro(valores)),
      });
      const corpo: unknown = await resposta.json().catch(() => null);

      if (resposta.status === 201) {
        setEnvio({
          estado: "criada",
          loja: esquemaDaLojaCriada.parse(corpo),
          email: validacao.cadastro.responsavel.email,
        });
        return;
      }

      const recusa = esquemaDaRecusaDeCadastro.safeParse(corpo);
      if (recusa.success) {
        const novos = errosPorCampo(recusa.data.campos);
        setErros(novos);
        setSugestao(recusa.data.sugestao ?? null);
        setEnvio({ estado: "parado" });
        focar(primeiroCampoComErro(novos));
        return;
      }

      setEnvio({
        estado: "falhou",
        mensagem:
          resposta.status === 401 || resposta.status === 403
            ? "Sua sessão não tem acesso à administração. Entre de novo."
            : "Não foi possível criar a loja agora. Tente de novo em instantes.",
      });
    } catch {
      setEnvio({
        estado: "falhou",
        mensagem:
          "Sem conexão com o servidor. Confira a internet e tente de novo.",
      });
    }
  }

  return (
    <CamposDaNovaLoja
      valores={valores}
      erros={erros}
      sugestao={sugestao}
      tipos={tipos}
      envio={envio}
      aoMudar={aoMudar}
      aoEnviar={(evento) => void aoEnviar(evento)}
      aoUsarSugestao={() => {
        if (sugestao === null) return;
        setValores((anteriores) => ({ ...anteriores, apelido: sugestao }));
        setErros((anteriores) => ({ ...anteriores, apelido: undefined }));
        setSugestao(null);
      }}
      aoRecarregarTipos={() => void carregarTipos()}
      aoRecomecar={() => {
        setValores(VALORES_INICIAIS);
        setErros({});
        setSugestao(null);
        setApelidoTocado(false);
        setEnvio({ estado: "parado" });
      }}
    />
  );
}
