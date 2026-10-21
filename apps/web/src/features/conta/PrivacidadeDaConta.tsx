"use client";

/**
 * "Privacidade e dados" da conta (LGPD, card #79): o histórico de aceites e as
 * preferências de cookies, e o pedido do arquivo com os próprios dados. A
 * exclusão da conta mora ao lado (`ExcluirConta`, em SegurancaDaConta) — é uma
 * só, a mesma que já existia.
 *
 * O arquivo só sai com a senha. O download passa pelo próprio site (o script
 * da página nunca vê o token) e vira um arquivo no aparelho; nada fica
 * guardado no navegador.
 */
import "@simpleclick/ui/styles/aceite.css";

import {
  ROTULO_DOS_DOCUMENTOS_LEGAIS,
  type SituacaoDosAceites,
} from "@simpleclick/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { Aviso, Botao, CampoDeSenha, Selo } from "@simpleclick/ui";

import {
  abrirPreferenciasDeCookies,
  consentimentoAtual,
  type ConsentimentoGravado,
} from "../legal/consentimento.ts";
import { LinkDoDocumento } from "../legal/AceiteDosTermos.tsx";
import { formatarVersao } from "../legal/JanelaDeNovoAceite.tsx";

type Resultado = { tom: "sucesso" | "erro"; texto: string } | null;

function quando(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function HistoricoDeConsentimentos({
  situacao,
}: {
  readonly situacao: SituacaoDosAceites;
}) {
  // O cookie só existe no navegador: lê depois de montar (HTML igual ao do servidor).
  const [cookies, setCookies] = useState<ConsentimentoGravado | null | undefined>();
  useEffect(() => setCookies(consentimentoAtual()), []);

  return (
    <div>
      {situacao.pendentes.length === 0 ? null : (
        <Aviso tom="info">
          Há versão nova para aceitar:{" "}
          {situacao.pendentes
            .map((p) => ROTULO_DOS_DOCUMENTOS_LEGAIS[p.documento])
            .join(", ")}
          . Atualize a página para ver a janela de aceite.
        </Aviso>
      )}
      <p className="sc-privacidade__texto">Documentos que você aceitou:</p>
      {situacao.historico.length === 0 ? (
        <p className="sc-privacidade__texto">
          Nenhum aceite registrado ainda. Contas criadas antes desta função aceitam no próximo acesso.
        </p>
      ) : (
        <ul className="sc-privacidade__historico" aria-label="Aceites registrados">
          {situacao.historico.map((a) => (
            <li className="sc-privacidade__item" key={`${a.documento}-${a.versao}`}>
              <span>
                <LinkDoDocumento documento={a.documento} />{" "}
                <span className="sc-privacidade__quando">· versão de {formatarVersao(a.versao)}</span>
              </span>
              <span className="sc-privacidade__quando">{quando(a.aceitoEm)}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="sc-privacidade__texto" style={{ marginBlockStart: "var(--espaco-5)" }}>
        Preferências de cookies deste navegador:
      </p>
      {cookies === undefined ? null : cookies === null ? (
        <p className="sc-privacidade__texto">
          Você ainda não escolheu. Só usamos os cookies essenciais até lá.
        </p>
      ) : (
        <ul className="sc-privacidade__historico" aria-label="Preferências de cookies">
          <li className="sc-privacidade__item">
            <span>Essenciais</span>
            <Selo tom="sucesso">Sempre ligados</Selo>
          </li>
          <li className="sc-privacidade__item">
            <span>Desempenho e análise</span>
            <Selo tom={cookies.desempenho ? "sucesso" : "neutro"}>
              {cookies.desempenho ? "Ligados" : "Desligados"}
            </Selo>
          </li>
          <li className="sc-privacidade__item">
            <span>Funcionais e preferências</span>
            <Selo tom={cookies.funcionais ? "sucesso" : "neutro"}>
              {cookies.funcionais ? "Ligados" : "Desligados"}
            </Selo>
          </li>
          <li className="sc-privacidade__item">
            <span className="sc-privacidade__quando">Escolhido em</span>
            <span className="sc-privacidade__quando">{quando(new Date(cookies.em).toISOString())}</span>
          </li>
        </ul>
      )}
      <div className="sc-privacidade__acoes" style={{ marginBlockStart: "var(--espaco-4)" }}>
        <Botao variante="secundaria" type="button" onClick={abrirPreferenciasDeCookies}>
          Mudar preferências de cookies
        </Botao>
      </div>
    </div>
  );
}

const MENSAGENS: Readonly<Record<string, string>> = {
  senha_incorreta: "A senha está incorreta.",
  muitas_exportacoes:
    "Você já pediu seus dados algumas vezes agora há pouco. Tente de novo em uma hora.",
};

/** Baixa o arquivo devolvido pela API como um download do navegador. */
async function baixar(
  formato: "json" | "csv",
  senha: string,
): Promise<Resultado> {
  let resposta: Response;
  try {
    resposta = await fetch("/api/conta/privacidade/exportar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ senha, formato }),
    });
  } catch {
    return { tom: "erro", texto: "Sem conexão agora. Tente de novo." };
  }
  if (!resposta.ok) {
    let erro: string | undefined;
    let mensagem: string | undefined;
    try {
      const corpo = (await resposta.json()) as { erro?: string; mensagem?: string };
      erro = corpo.erro;
      mensagem = corpo.mensagem;
    } catch {
      /* corpo vazio: cai na mensagem padrão */
    }
    return {
      tom: "erro",
      texto:
        MENSAGENS[erro ?? ""] ??
        mensagem ??
        "Não foi possível gerar o arquivo agora. Tente de novo.",
    };
  }
  const arquivo = await resposta.blob();
  const dia = new Date().toISOString().slice(0, 10);
  const endereco = URL.createObjectURL(arquivo);
  const ancora = document.createElement("a");
  ancora.href = endereco;
  ancora.download =
    formato === "csv"
      ? `meus-pedidos-simpleclick-${dia}.csv`
      : `meus-dados-simpleclick-${dia}.json`;
  document.body.append(ancora);
  ancora.click();
  ancora.remove();
  URL.revokeObjectURL(endereco);
  return {
    tom: "sucesso",
    texto:
      formato === "csv"
        ? "Pronto: a planilha dos seus pedidos foi baixada."
        : "Pronto: o arquivo com os seus dados foi baixado.",
  };
}

export function ExportarMeusDados() {
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState<"json" | "csv" | null>(null);
  const [resultado, setResultado] = useState<Resultado>(null);

  async function pedir(formato: "json" | "csv", evento?: FormEvent) {
    evento?.preventDefault();
    setEnviando(formato);
    setResultado(null);
    const r = await baixar(formato, senha);
    setEnviando(null);
    setResultado(r);
    if (r?.tom === "sucesso") setSenha("");
  }

  if (!aberto) {
    return (
      <Botao variante="secundaria" type="button" onClick={() => setAberto(true)}>
        Baixar meus dados
      </Botao>
    );
  }

  return (
    <form
      className="sc-seguranca__form"
      aria-label="Baixar meus dados"
      noValidate
      onSubmit={(e) => void pedir("json", e)}
    >
      <Aviso tom="info">
        O arquivo reúne seu cadastro, endereços, pedidos, favoritos e aceites. Ele tem dados
        pessoais: guarde em lugar seguro. Por segurança, pedimos a sua senha.
      </Aviso>
      {resultado === null ? null : <Aviso tom={resultado.tom}>{resultado.texto}</Aviso>}
      <CampoDeSenha
        id="exportar-senha"
        rotulo="Sua senha"
        autoComplete="current-password"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
      />
      <div className="sc-privacidade__acoes">
        <Botao
          type="submit"
          carregando={enviando === "json"}
          rotuloDeEspera="Gerando…"
          desabilitado={senha === "" || enviando !== null}
        >
          Baixar tudo (JSON)
        </Botao>
        <Botao
          type="button"
          variante="secundaria"
          carregando={enviando === "csv"}
          rotuloDeEspera="Gerando…"
          desabilitado={senha === "" || enviando !== null}
          onClick={() => void pedir("csv")}
        >
          Baixar pedidos (planilha CSV)
        </Botao>
        <Botao
          type="button"
          variante="discreta"
          onClick={() => {
            setAberto(false);
            setSenha("");
            setResultado(null);
          }}
        >
          Cancelar
        </Botao>
      </div>
    </form>
  );
}
