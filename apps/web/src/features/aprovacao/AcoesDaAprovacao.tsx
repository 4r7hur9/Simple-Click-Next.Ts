"use client";

/**
 * Os botões da tela de aprovação: editar os dados do cadastro e, quando a
 * loja foi recusada, reenviá-la para nova análise. Fala com
 * `/api/loja/aprovacao`; depois de cada ação a página é lida de novo, e a
 * situação nova (ou o painel liberado) aparece sem a pessoa sair daqui.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Aviso,
  Botao,
  Campo,
  descritoresDoCampo,
  Seletor,
} from "@simpleclick/ui";
import { EXPLICACOES_PARA_CLIENTES } from "../loja/explicacoes-para-clientes.ts";

interface DadosEditaveis {
  readonly nome: string;
  readonly tipoDeNegocio: string;
  readonly whatsapp: string;
  readonly cidade: string;
  readonly uf: string;
}

const ENDERECO = "/api/loja/aprovacao";

async function enviarParaAPonte(
  metodo: "PUT" | "POST",
  corpo?: unknown,
): Promise<{ readonly ok: boolean; readonly mensagem?: string }> {
  try {
    const resposta = await fetch(ENDERECO, {
      method: metodo,
      headers: { "content-type": "application/json" },
      credentials: "include",
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    });
    if (resposta.ok) return { ok: true };
    const lido = (await resposta.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const campos = lido["campos"];
    const primeira = Array.isArray(campos)
      ? (campos[0] as Record<string, unknown> | undefined)
      : undefined;
    return {
      ok: false,
      mensagem:
        (typeof primeira?.["mensagem"] === "string"
          ? primeira["mensagem"]
          : undefined) ??
        (typeof lido["mensagem"] === "string" ? lido["mensagem"] : undefined) ??
        "Não foi possível salvar agora. Tente novamente.",
    };
  } catch {
    return { ok: false, mensagem: "Sem conexão. Tente novamente." };
  }
}

export function AcoesDaAprovacao({
  recusada,
  dados,
}: {
  readonly recusada: boolean;
  readonly dados: DadosEditaveis | null;
}) {
  const roteador = useRouter();
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tom: "erro" | "sucesso"; texto: string }>();
  const [nome, setNome] = useState(dados?.nome ?? "");
  const [tipo, setTipo] = useState(dados?.tipoDeNegocio ?? "");
  const [whatsapp, setWhatsapp] = useState(dados?.whatsapp ?? "");
  const [cidade, setCidade] = useState(dados?.cidade ?? "");
  const [uf, setUf] = useState(dados?.uf ?? "");
  const [tipos, setTipos] = useState<{ codigo: string; nome: string }[]>([]);

  useEffect(() => {
    if (!editando || tipos.length > 0) return;
    fetch("/api/painel/lojas/tipos")
      .then((resposta) => resposta.json())
      .then((corpo: { tipos?: { codigo: string; nome: string }[] }) =>
        setTipos(corpo.tipos ?? []),
      )
      .catch(() => undefined);
  }, [editando, tipos.length]);

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setAviso(undefined);
    setOcupado(true);
    const resultado = await enviarParaAPonte("PUT", {
      nome: nome.trim(),
      tipoDeNegocio: tipo,
      ...(whatsapp.trim() === "" ? {} : { whatsapp: whatsapp.trim() }),
      ...(cidade.trim() === "" ? {} : { cidade: cidade.trim() }),
      ...(uf.trim() === "" ? {} : { uf: uf.trim().toUpperCase() }),
    });
    setOcupado(false);
    if (!resultado.ok) {
      setAviso({ tom: "erro", texto: resultado.mensagem ?? "" });
      return;
    }
    setEditando(false);
    setAviso({ tom: "sucesso", texto: "Dados atualizados." });
    roteador.refresh();
  }

  async function reenviar() {
    setAviso(undefined);
    setOcupado(true);
    const resultado = await enviarParaAPonte("POST");
    setOcupado(false);
    if (!resultado.ok) {
      setAviso({ tom: "erro", texto: resultado.mensagem ?? "" });
      return;
    }
    roteador.refresh();
  }

  return (
    <div className="sc-aprovacao__acoes-bloco">
      {aviso ? (
        <Aviso tom={aviso.tom === "erro" ? "erro" : "sucesso"}>
          {aviso.texto}
        </Aviso>
      ) : null}

      {editando ? (
        <form
          className="sc-conta__form"
          onSubmit={(evento) => void salvar(evento)}
          noValidate
          aria-label="Editar dados da loja"
        >
          <div className="sc-conta__campos">
            <Campo
              id="aprovacao-nome"
              rotulo="Nome da loja"
              obrigatorio
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              desabilitado={ocupado}
            />
            <Campo
              id="aprovacao-tipo"
              rotulo="Tipo de negócio"
              obrigatorio
              info={EXPLICACOES_PARA_CLIENTES.tipoDeNegocio}
              controle={
                <Seletor
                  id="aprovacao-tipo"
                  aria-describedby={descritoresDoCampo("aprovacao-tipo", {
                    info: true,
                  }).join(" ")}
                  value={tipo}
                  disabled={ocupado}
                  onChange={(valor) => setTipo(valor)}
                >
                  {tipos.length === 0 ? (
                    <option value={tipo}>{tipo}</option>
                  ) : null}
                  {tipos.map((cada) => (
                    <option key={cada.codigo} value={cada.codigo}>
                      {cada.nome}
                    </option>
                  ))}
                </Seletor>
              }
            />
            <Campo
              id="aprovacao-whatsapp"
              type="tel"
              inputMode="tel"
              rotulo="WhatsApp da loja com DDD"
              placeholder="(85) 91234-5678"
              value={whatsapp}
              onChange={(evento) => setWhatsapp(evento.target.value)}
              desabilitado={ocupado}
            />
            <div className="sc-cadastro__duas-colunas">
              <Campo
                id="aprovacao-cidade"
                rotulo="Cidade"
                value={cidade}
                onChange={(evento) => setCidade(evento.target.value)}
                desabilitado={ocupado}
              />
              <Campo
                id="aprovacao-uf"
                rotulo="Estado (UF)"
                placeholder="Ex.: CE"
                maxLength={2}
                value={uf}
                onChange={(evento) => setUf(evento.target.value.toUpperCase())}
                desabilitado={ocupado}
              />
            </div>
          </div>
          <div className="sc-cadastro__acoes">
            <Botao
              variante="secundaria"
              type="button"
              onClick={() => setEditando(false)}
              desabilitado={ocupado}
            >
              Cancelar
            </Botao>
            <Botao type="submit" carregando={ocupado} rotuloDeEspera="Salvando…">
              Salvar dados
            </Botao>
          </div>
        </form>
      ) : (
        <div className="sc-aprovacao__acoes">
          {dados !== null ? (
            <Botao
              variante={recusada ? "secundaria" : "primaria"}
              type="button"
              onClick={() => setEditando(true)}
            >
              Editar dados da loja
            </Botao>
          ) : null}
          {recusada ? (
            <Botao
              type="button"
              onClick={() => void reenviar()}
              carregando={ocupado}
              rotuloDeEspera="Enviando…"
            >
              Reenviar para análise
            </Botao>
          ) : null}
        </div>
      )}
    </div>
  );
}
