"use client";

/**
 * O formulário de outra loja do dono (card #32), com os campos do cadastro de
 * lojista: nome, tipo de negócio, endereço, WhatsApp, cidade e UF. Vai à ponte
 * `/api/painel/lojas`, que abre a sessão nova de dono. A loja nasce aguardando
 * aprovação; passou do limite de lojas, a API diz 409 e a tela explica.
 */
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  Aviso,
  Botao,
  Campo,
  descritoresDoCampo,
  Seletor,
} from "@simpleclick/ui";

import { EXPLICACOES_PARA_CLIENTES } from "../loja/explicacoes-para-clientes.ts";

interface Tipo {
  readonly codigo: string;
  readonly nome: string;
}

interface Recusa {
  readonly erro: string;
  readonly mensagem: string;
  readonly sugestao?: string;
}

function apelidoDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function FormularioOutraLoja() {
  const [tipos, setTipos] = useState<readonly Tipo[]>([]);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("");
  const [apelido, setApelido] = useState("");
  const [apelidoTocado, setApelidoTocado] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [recusa, setRecusa] = useState<Recusa | null>(null);
  const [criada, setCriada] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/painel/lojas/tipos");
        const corpo: unknown = await r.json();
        const lista = (corpo as { tipos?: Tipo[] }).tipos;
        if (Array.isArray(lista)) setTipos(lista);
      } catch {
        /* sem tipos, o envio avisa */
      }
    })();
  }, []);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setRecusa(null);
    try {
      const r = await fetch("/api/painel/lojas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome,
          tipoDeNegocio: tipo,
          ...(apelido === "" ? {} : { apelido }),
          ...(whatsapp === "" ? {} : { whatsapp }),
          ...(cidade === "" ? {} : { cidade }),
          ...(uf === "" ? {} : { uf }),
        }),
      });
      const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (r.status === 201) {
        const loja = corpo["loja"] as { apelido?: string } | undefined;
        setCriada(loja?.apelido ?? apelido);
        return;
      }
      const erro = typeof corpo["erro"] === "string" ? corpo["erro"] : "erro";
      const mensagem =
        erro === "limite_atingido"
          ? "Você já tem o máximo de lojas do seu plano. Fale com o suporte para abrir mais."
          : erro === "apelido_em_uso"
            ? "Esse endereço já está em uso."
            : typeof corpo["mensagem"] === "string"
              ? corpo["mensagem"]
              : "Não foi possível abrir a loja agora. Tente de novo.";
      setRecusa({
        erro,
        mensagem,
        ...(typeof corpo["sugestao"] === "string" ? { sugestao: corpo["sugestao"] } : {}),
      });
    } catch {
      setRecusa({ erro: "rede", mensagem: "Sem conexão agora. Tente de novo." });
    } finally {
      setEnviando(false);
    }
  }

  if (criada !== null) {
    return (
      <div className="grid gap-4">
        <Aviso tom="sucesso" titulo="Loja enviada para aprovação">
          Assim que a administração liberar, ela abre no painel. Endereço: /loja/{criada}
        </Aviso>
        <Link className="sc-botao sc-botao--primaria" href="/escolher-loja">
          Voltar às minhas lojas
        </Link>
      </div>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={(e) => void enviar(e)}>
      {recusa ? (
        <Aviso tom={recusa.erro === "limite_atingido" ? "atencao" : "erro"} titulo={recusa.erro === "limite_atingido" ? "Limite de lojas atingido" : undefined}>
          {recusa.mensagem}
          {recusa.sugestao ? (
            <>
              {" "}
              <button type="button" className="underline" onClick={() => { setApelido(recusa.sugestao ?? ""); setApelidoTocado(true); setRecusa(null); }}>
                Usar {recusa.sugestao}
              </button>
            </>
          ) : null}
        </Aviso>
      ) : null}
      <Campo
        id="outra-loja-nome"
        rotulo="Nome da loja"
        value={nome}
        onChange={(e) => {
          setNome(e.target.value);
          if (!apelidoTocado) setApelido(apelidoDoNome(e.target.value));
        }}
        obrigatorio
      />
      <Campo
        id="outra-loja-tipo"
        rotulo="Tipo de negócio"
        info={EXPLICACOES_PARA_CLIENTES.tipoDeNegocio}
        obrigatorio
        controle={
          <Seletor
            id="outra-loja-tipo"
            aria-describedby={descritoresDoCampo("outra-loja-tipo", {
              info: true,
            }).join(" ")}
            value={tipo}
            onChange={(valor) => setTipo(valor)}
            required
          >
            <option value="">Escolha…</option>
            {tipos.map((t) => (
              <option key={t.codigo} value={t.codigo}>{t.nome}</option>
            ))}
          </Seletor>
        }
      />
      <Campo
        id="outra-loja-apelido"
        rotulo="Link da loja (endereço na internet)"
        info={EXPLICACOES_PARA_CLIENTES.linkDaLoja}
        dica={`simpleclick…/loja/${apelido === "" ? "seu-endereco" : apelido}`}
        value={apelido}
        onChange={(e) => {
          setApelido(e.target.value.toLowerCase());
          setApelidoTocado(true);
        }}
        erro={recusa?.erro === "apelido_em_uso" ? "Esse endereço já está em uso." : undefined}
      />
      <Campo id="outra-loja-whatsapp" rotulo="WhatsApp da loja com DDD" placeholder="(85) 91234-5678" type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <Campo id="outra-loja-cidade" rotulo="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
        <Campo id="outra-loja-uf" rotulo="Estado (UF)" placeholder="Ex.: CE" maxLength={2} value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} />
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Link className="sc-botao sc-botao--secundaria" href="/escolher-loja">Cancelar</Link>
        <Botao type="submit" carregando={enviando} rotuloDeEspera="Enviando…">Abrir loja</Botao>
      </div>
    </form>
  );
}
