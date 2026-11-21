"use client";

/**
 * As ações sobre uma pessoa na ficha (card #170, T-9): editar nome e telefone,
 * desativar, reativar e gerar o link único de acesso.
 *
 * Todas têm dois passos: o botão abre uma janela que diz o que muda, e só o
 * segundo clique manda à API. Cada ato entra na auditoria da plataforma, e
 * quem registra é a API, na mesma transação.
 *
 * - Desativar pede motivo. Se a pessoa é a única dona ativa de alguma loja, a
 *   API responde 409 `dono_unico` com as lojas; a janela as lista e só envia
 *   de novo depois da ciência marcada.
 * - Gerar o link pede motivo e, quando a pessoa já tem senha, a confirmação
 *   explícita de que a senha atual deixa de valer.
 * - Conta protegida (administração da plataforma) não tem ação nenhuma.
 * - NÃO existe ação de conceder administração: a API nem aceita o campo.
 *
 * O link que volta de "gerar" vai direto para `AcessoDeUsoUnico`: aparece uma
 * vez e não é guardado em lugar nenhum.
 */

import {
  esquemaDaEdicaoDePessoa,
  esquemaDaFichaDaPessoa,
  esquemaDoAcessoGerado,
  esquemaDoMotivoDaPessoa,
  type AcessoGeradoNoContrato,
  type FichaDaPessoaNoContrato,
} from "@simpleclick/contracts";
import { Aviso, Botao, Campo, type ConteudoDoInfo } from "@simpleclick/ui";
import { useId, useState } from "react";

import { AcessoDeUsoUnico } from "./AcessoDeUsoUnico.tsx";
import { mensagemDaApi } from "./apresentacao.ts";
import {
  INFO_DA_DESATIVACAO_DA_PESSOA,
  INFO_DO_LINK_DE_ACESSO,
  INFO_DO_MOTIVO_DO_ATO,
  INFO_DO_TELEFONE_DA_PESSOA,
} from "./explicacoes.ts";
import { JanelaDeConfirmacao } from "./JanelaDeConfirmacao.tsx";

/** O texto do "i", para repetir à vista na janela do ato. */
function textoDoInfo(info: ConteudoDoInfo): string {
  return typeof info === "string" ? info : info.texto;
}

export type AtoDaPessoa = "editar" | "desativar" | "reativar" | "acesso";

/** Quais atos a ficha oferece, na ordem dos botões. */
export function atosDaPessoa(
  ficha: Pick<FichaDaPessoaNoContrato, "desativada" | "protegida">,
): AtoDaPessoa[] {
  if (ficha.protegida) return [];
  return ficha.desativada ? ["reativar"] : ["editar", "acesso", "desativar"];
}

const ROTULO_DO_BOTAO: Readonly<Record<AtoDaPessoa, string>> = {
  editar: "Editar dados",
  acesso: "Gerar link de acesso",
  desativar: "Desativar conta",
  reativar: "Reativar conta",
};

const TITULO_DA_JANELA: Readonly<
  Record<AtoDaPessoa, (nome: string) => string>
> = {
  editar: (nome) => `Editar os dados de ${nome}?`,
  acesso: (nome) => `Gerar um link de acesso para ${nome}?`,
  desativar: (nome) => `Desativar a conta de ${nome}?`,
  reativar: (nome) => `Reativar a conta de ${nome}?`,
};

const CONFIRMAR: Readonly<Record<AtoDaPessoa, string>> = {
  editar: "Confirmar alteração",
  acesso: "Gerar o link",
  desativar: "Confirmar desativação",
  reativar: "Confirmar reativação",
};

const ESPERA: Readonly<Record<AtoDaPessoa, string>> = {
  editar: "Salvando…",
  acesso: "Gerando…",
  desativar: "Desativando…",
  reativar: "Reativando…",
};

const FALHA: Readonly<Record<AtoDaPessoa, string>> = {
  editar: "Os dados não foram alterados; tente de novo.",
  acesso: "O link não foi gerado; tente de novo.",
  desativar: "A conta não foi desativada; tente de novo.",
  reativar: "A conta não foi reativada; tente de novo.",
};

/** O que cada ato faz, dito antes de o segundo clique. */
export function consequenciasDoAtoDaPessoa(
  ato: AtoDaPessoa,
  ficha: Pick<FichaDaPessoaNoContrato, "temSenha">,
): string[] {
  switch (ato) {
    case "editar":
      return [
        "Só o nome e o telefone mudam. O e-mail da conta não é alterado por aqui.",
        "A alteração fica registrada na auditoria da plataforma, com o seu nome.",
      ];
    case "acesso":
      return [
        "O link vale uma vez e por 60 minutos. Ele aparece só na próxima janela: copie e entregue à pessoa.",
        "Qualquer link ou convite pendente desta pessoa deixa de valer.",
        ficha.temSenha
          ? "Quem abrir o link define uma nova senha, e as sessões abertas caem."
          : "Quem abrir o link define a primeira senha e entra.",
        "Gerar o link fica registrado na auditoria. O link em si não é guardado.",
      ];
    case "desativar":
      return [
        "A pessoa deixa de entrar e as sessões abertas caem na hora.",
        "Nada é apagado: pedidos e vínculos com lojas continuam, e reativar devolve o acesso.",
        "A desativação fica registrada na auditoria da plataforma.",
      ];
    case "reativar":
      return [
        "A pessoa volta a entrar com a senha que já tinha.",
        "A reativação fica registrada na auditoria da plataforma.",
      ];
  }
}

/** O que mudou nos campos de edição, no corpo que a API pede. */
export function corpoDaEdicao(
  ficha: Pick<FichaDaPessoaNoContrato, "nome" | "telefone">,
  campos: { readonly nome: string; readonly telefone: string },
): { readonly corpo: object } | { readonly erro: string } {
  const corpo: { nome?: string; telefone?: string | null } = {};
  if (campos.nome.trim() !== (ficha.nome ?? "")) corpo.nome = campos.nome;
  const telefone = campos.telefone.trim();
  if (telefone !== (ficha.telefone ?? "")) {
    corpo.telefone = telefone === "" ? null : telefone;
  }
  if (Object.keys(corpo).length === 0) {
    return { erro: "Nada mudou. Altere o nome ou o telefone." };
  }
  const lido = esquemaDaEdicaoDePessoa.safeParse(corpo);
  return lido.success
    ? { corpo: lido.data }
    : { erro: lido.error.issues[0]?.message ?? "Confira os campos." };
}

interface LojaSemDono {
  readonly lojaId: string;
  readonly nome: string;
}

function lojasDoConflito(corpo: unknown): LojaSemDono[] {
  if (typeof corpo !== "object" || corpo === null) return [];
  const { lojas } = corpo as { lojas?: unknown };
  if (!Array.isArray(lojas)) return [];
  return lojas.flatMap((loja: unknown) => {
    if (typeof loja !== "object" || loja === null) return [];
    const { lojaId, nome } = loja as { lojaId?: unknown; nome?: unknown };
    return typeof lojaId === "string" && typeof nome === "string"
      ? [{ lojaId, nome }]
      : [];
  });
}

export interface AcoesDaPessoaProps {
  readonly ficha: FichaDaPessoaNoContrato;
  /** A ficha nova que cada ato devolve. */
  readonly aoMudar: (ficha: FichaDaPessoaNoContrato) => void;
  /** Gerar o link não muda a ficha, mas a trilha ganha o ato: recarrega. */
  readonly aoRecarregar: () => void;
}

export function AcoesDaPessoa({
  ficha,
  aoMudar,
  aoRecarregar,
}: AcoesDaPessoaProps) {
  const idBase = useId();
  const [ato, setAto] = useState<AtoDaPessoa | null>(null);
  const [motivo, setMotivo] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [erro, setErro] = useState<string | undefined>();
  const [faltaCiencia, setFaltaCiencia] = useState<string | undefined>();
  const [cienteDaSenha, setCienteDaSenha] = useState(false);
  const [semDono, setSemDono] = useState<LojaSemDono[] | null>(null);
  const [cienteSemDono, setCienteSemDono] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const [acesso, setAcesso] = useState<AcessoGeradoNoContrato | null>(null);

  const atos = atosDaPessoa(ficha);
  const rotuloDaPessoa = ficha.nome ?? ficha.email;

  if (ficha.protegida) {
    return (
      <Aviso
        tom="info"
        titulo="Conta da administração da plataforma"
        aoVivo={false}
      >
        <p>
          Esta conta não é alterada por aqui: não dá para editar, desativar nem
          gerar link de acesso.
        </p>
      </Aviso>
    );
  }

  function abrir(escolhido: AtoDaPessoa) {
    setAto(escolhido);
    setMotivo("");
    setNome(ficha.nome ?? "");
    setTelefone(ficha.telefone ?? "");
    setErro(undefined);
    setFaltaCiencia(undefined);
    setCienteDaSenha(false);
    setSemDono(null);
    setCienteSemDono(false);
    setFalha(null);
  }

  function fechar() {
    if (enviando) return;
    setAto(null);
  }

  async function confirmar() {
    if (ato === null) return;
    const base = `/api/admin/pessoas/${encodeURIComponent(ficha.identidadeId)}`;

    let corpo: object;
    let metodo: "PATCH" | "PUT" | "POST";
    let endereco = base;
    if (ato === "editar") {
      const montado = corpoDaEdicao(ficha, { nome, telefone });
      if ("erro" in montado) {
        setErro(montado.erro);
        return;
      }
      corpo = montado.corpo;
      metodo = "PATCH";
    } else {
      const lido = esquemaDoMotivoDaPessoa.safeParse(motivo);
      if (!lido.success) {
        setErro(lido.error.issues[0]?.message ?? "Informe o motivo.");
        return;
      }
      if (ato === "acesso" && ficha.temSenha && !cienteDaSenha) {
        setFaltaCiencia("Confirme que a senha atual deixa de valer.");
        return;
      }
      if (ato === "desativar" && semDono !== null && !cienteSemDono) {
        setFaltaCiencia("Confirme que as lojas ficarão sem dono.");
        return;
      }
      corpo =
        ato === "desativar" && cienteSemDono
          ? { motivo: lido.data, lojasSemDonoCiente: true }
          : { motivo: lido.data };
      metodo = ato === "acesso" ? "POST" : "PUT";
      endereco = `${base}/${ato === "acesso" ? "acesso" : ato === "desativar" ? "desativacao" : "reativacao"}`;
    }

    setErro(undefined);
    setFaltaCiencia(undefined);
    setEnviando(true);
    setFalha(null);
    try {
      const resposta = await fetch(endereco, {
        method: metodo,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const lido: unknown = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        const conflito =
          typeof lido === "object" && lido !== null
            ? (lido as { erro?: unknown }).erro
            : undefined;
        if (resposta.status === 409 && conflito === "dono_unico") {
          setSemDono(lojasDoConflito(lido));
          setCienteSemDono(false);
          return;
        }
        setFalha(
          resposta.status === 401 || resposta.status === 403
            ? "Sua sessão não tem acesso à administração. Entre de novo."
            : mensagemDaApi(lido, FALHA[ato]),
        );
        return;
      }
      if (ato === "acesso") {
        const gerado = esquemaDoAcessoGerado.parse(lido);
        setAto(null);
        setAcesso(gerado);
        return;
      }
      const nova = esquemaDaFichaDaPessoa.parse(lido);
      setAto(null);
      aoMudar(nova);
    } catch {
      setFalha(FALHA[ato]);
    } finally {
      setEnviando(false);
    }
  }

  const pedeMotivo = ato !== null && ato !== "editar";

  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-2">
        {atos.map((escolhido) => (
          <Botao
            key={escolhido}
            variante={
              escolhido === "acesso" || escolhido === "reativar"
                ? "primaria"
                : "secundaria"
            }
            onClick={() => abrir(escolhido)}
          >
            {ROTULO_DO_BOTAO[escolhido]}
          </Botao>
        ))}
      </span>

      {ato !== null && (
        <JanelaDeConfirmacao
          id={`${idBase}-ato`}
          titulo={TITULO_DA_JANELA[ato](rotuloDaPessoa)}
          aoFechar={fechar}
          rodape={
            <>
              <Botao
                variante={ato === "desativar" ? "perigo" : "primaria"}
                carregando={enviando}
                rotuloDeEspera={ESPERA[ato]}
                onClick={() => void confirmar()}
              >
                {CONFIRMAR[ato]}
              </Botao>
              <Botao
                variante="secundaria"
                desabilitado={enviando}
                onClick={fechar}
              >
                Cancelar
              </Botao>
            </>
          }
        >
          <div className="grid gap-4">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {consequenciasDoAtoDaPessoa(ato, ficha).map((consequencia) => (
                <li key={consequencia}>{consequencia}</li>
              ))}
            </ul>

            {ato === "acesso" && ficha.temSenha && (
              <Aviso
                tom="atencao"
                titulo="Esta pessoa já tem senha"
                aoVivo={false}
              >
                <p>
                  O link troca a senha atual por uma nova. Gere só se a pessoa
                  pediu ajuda para entrar.
                </p>
                <label className="mt-2 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={cienteDaSenha}
                    onChange={(evento) => {
                      setCienteDaSenha(evento.target.checked);
                      setFaltaCiencia(undefined);
                    }}
                  />
                  <span>Entendo que a senha atual deixa de valer.</span>
                </label>
              </Aviso>
            )}

            {ato === "desativar" && semDono !== null && (
              <Aviso
                tom="atencao"
                titulo="Estas lojas ficarão sem dono"
                aoVivo={false}
              >
                <ul className="list-disc pl-5 text-sm">
                  {semDono.map((loja) => (
                    <li key={loja.lojaId}>{loja.nome}</li>
                  ))}
                </ul>
                <label className="mt-2 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={cienteSemDono}
                    onChange={(evento) => {
                      setCienteSemDono(evento.target.checked);
                      setFaltaCiencia(undefined);
                    }}
                  />
                  <span>
                    Estou ciente: desativar esta pessoa deixa estas lojas sem
                    dono ativo.
                  </span>
                </label>
              </Aviso>
            )}

            {ato === "editar" && (
              <>
                <Campo
                  id={`${idBase}-nome`}
                  rotulo="Nome"
                  obrigatorio
                  autoComplete="off"
                  value={nome}
                  onChange={(evento) => {
                    setNome(evento.target.value);
                    setErro(undefined);
                  }}
                />
                <Campo
                  id={`${idBase}-telefone`}
                  rotulo="Telefone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  info={INFO_DO_TELEFONE_DA_PESSOA}
                  dica="Com DDD. Vazio tira o telefone da ficha."
                  value={telefone}
                  onChange={(evento) => {
                    setTelefone(evento.target.value);
                    setErro(undefined);
                  }}
                />
              </>
            )}

            {pedeMotivo && (
              <Campo
                id={`${idBase}-motivo`}
                rotulo={
                  ato === "acesso"
                    ? "Motivo do link"
                    : ato === "desativar"
                      ? "Motivo da desativação"
                      : "Motivo da reativação"
                }
                obrigatorio
                info={INFO_DO_MOTIVO_DO_ATO}
                dica="Até 300 caracteres. Fica na auditoria da plataforma."
                erro={erro}
                controle={
                  <textarea
                    id={`${idBase}-motivo`}
                    rows={3}
                    maxLength={300}
                    className="sc-campo__controle"
                    value={motivo}
                    aria-invalid={erro !== undefined || undefined}
                    aria-describedby={[
                      `${idBase}-motivo-info`,
                      `${idBase}-motivo-dica`,
                      erro !== undefined && `${idBase}-motivo-erro`,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onChange={(evento) => {
                      setMotivo(evento.target.value);
                      setErro(undefined);
                    }}
                  />
                }
              />
            )}

            {ato === "desativar" && (
              <p className="text-sm text-[var(--cor-tinta-suave)]">
                {textoDoInfo(INFO_DA_DESATIVACAO_DA_PESSOA)}
              </p>
            )}
            {ato === "acesso" && (
              <p className="text-sm text-[var(--cor-tinta-suave)]">
                {textoDoInfo(INFO_DO_LINK_DE_ACESSO)}
              </p>
            )}

            {ato === "editar" && erro !== undefined && (
              <Aviso tom="erro" titulo="Confira os dados">
                <p>{erro}</p>
              </Aviso>
            )}
            {faltaCiencia !== undefined && (
              <Aviso tom="erro" titulo="Falta a confirmação">
                <p>{faltaCiencia}</p>
              </Aviso>
            )}
            {falha !== null && (
              <Aviso tom="erro" titulo="Nada mudou">
                <p>{falha}</p>
              </Aviso>
            )}
          </div>
        </JanelaDeConfirmacao>
      )}

      {acesso !== null && (
        <AcessoDeUsoUnico
          acesso={acesso}
          nomeDaPessoa={rotuloDaPessoa}
          aoFechar={() => {
            // O link some aqui: não fica em estado nem em lugar nenhum.
            setAcesso(null);
            aoRecarregar();
          }}
        />
      )}
    </>
  );
}
