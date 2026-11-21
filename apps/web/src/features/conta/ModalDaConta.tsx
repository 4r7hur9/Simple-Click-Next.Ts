"use client";

/**
 * O modal "Minha conta" (card #151): Dados, Endereços e Segurança num diálogo
 * que abre de QUALQUER tela do cliente logado, pelo topo.
 *
 * Como abre:
 * - por qualquer `<a data-abre-conta="dados|enderecos|seguranca">` (o item
 *   "Minha conta" do menu do avatar e o "Perfil" da barra inferior); o `href`
 *   do link é a reserva sem script (`/conta/dados` vai para Pedidos com o modal
 *   aberto). O ouvinte fica no `document`, na fase de captura, para chegar
 *   antes do `Link` do Next, que não navega se o clique já foi tratado;
 * - por `?conta=<aba>` no endereço (link profundo: e-mail, `?proximo=` do login,
 *   as rotas antigas que viram redirect). Só valem as abas de `lib/abas-da-conta`.
 *
 * O estado mora na URL: abrir por um gatilho empurra uma entrada no histórico
 * (o "voltar" do celular FECHA o modal em vez de sair da página); trocar de aba
 * a substitui; fechar volta uma entrada, ou a substitui no link profundo.
 *
 * É a `Gaveta` do packages/ui (dialog com `showModal`: foco preso, fundo
 * inerte, Esc, botão de fechar e foco de volta) com as `Abas` (tablist
 * WAI-ARIA). Dentro dele, nada fica guardado depois de fechar: a `Gaveta`
 * desmonta o conteúdo, e os dados são lidos de novo a cada abertura, pelo
 * navegador, nas rotas `/api/conta/*` que já existem (o token nunca passa pelo
 * script da página, P-008). Cada aba só carrega quando é aberta.
 */
import {
  Abas,
  Aviso,
  Botao,
  Cartao,
  Erro,
  Esqueleto,
  Gaveta,
  IconeConfirmar,
  IconeLocal,
  IconeMenu,
  IconeUsuario,
} from "@simpleclick/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import {
  ABAS_DA_CONTA,
  lerAbaDaConta,
  PARAMETRO_DA_CONTA,
  PARAMETRO_DE_ESTADO,
  ROTULO_DA_ABA,
  type AbaDaConta,
} from "../../lib/abas-da-conta.ts";
import {
  lerAceitesDaConta,
  lerDadosDaConta,
  lerSessoesAbertas,
  type DadosDaConta as Dados,
  type SessaoAberta,
} from "../../lib/conta-do-cliente.ts";
import { comDestino } from "../../lib/destino-seguro.ts";
import type { SituacaoDosAceites } from "@simpleclick/contracts";
import { chamarConta } from "./chamar-conta.ts";
import { DadosDaConta } from "./DadosDaConta.tsx";
import { EnderecosSalvos } from "./EnderecosSalvos.tsx";
import {
  ExportarMeusDados,
  HistoricoDeConsentimentos,
} from "./PrivacidadeDaConta.tsx";
import {
  PainelDeSeguranca,
  type AcoesDoServidorDaConta,
  type SessoesDoPainel,
} from "./SegurancaDaConta.tsx";

export interface ModalDaContaProps {
  /** O e-mail da conta do topo: leitura de outra conta (outra aba trocou) é descartada. */
  readonly email: string;
  readonly acoes: AcoesDoServidorDaConta;
}

type Leitura<T> =
  | { readonly estado: "carregando" }
  | { readonly estado: "ok"; readonly dados: T }
  | { readonly estado: "erro" }
  | { readonly estado: "sessao" };

/** O endereço atual com a aba pedida; sem aba, sem `conta` e sem `estado`. */
function enderecoComAba(aba: AbaDaConta | null): string {
  const endereco = new URL(window.location.href);
  if (aba === null) {
    endereco.searchParams.delete(PARAMETRO_DA_CONTA);
    endereco.searchParams.delete(PARAMETRO_DE_ESTADO);
  } else {
    endereco.searchParams.set(PARAMETRO_DA_CONTA, aba);
  }
  return `${endereco.pathname}${endereco.search}${endereco.hash}`;
}

/** Lê uma rota GET da conta; só roda enquanto `ativa`. 401 vira "sessao". */
function useLeitura<T>(
  ativa: boolean,
  caminho: string,
  conferir: (corpo: unknown) => T | null,
): { leitura: Leitura<T>; tentarDeNovo: () => void } {
  const [leitura, setLeitura] = useState<Leitura<T>>({ estado: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!ativa) return;
    let cancelado = false;
    void chamarConta("GET", caminho).then((resposta) => {
      if (cancelado) return;
      if (resposta.status === 401) {
        setLeitura({ estado: "sessao" });
        return;
      }
      const lido = resposta.ok ? conferir(resposta.corpo) : null;
      setLeitura(lido === null ? { estado: "erro" } : { estado: "ok", dados: lido });
    });
    return () => {
      cancelado = true;
    };
  }, [ativa, caminho, conferir, tentativa]);

  const tentarDeNovo = useCallback(() => {
    setLeitura({ estado: "carregando" });
    setTentativa((n) => n + 1);
  }, []);
  return { leitura, tentarDeNovo };
}

/** Carregando, erro e sessão vencida de uma leitura; o "ok" é de quem chama. */
function EstadoDaLeitura({
  leitura,
  tentarDeNovo,
  rotulo,
}: {
  readonly leitura: Exclude<Leitura<unknown>, { estado: "ok" }>;
  readonly tentarDeNovo: () => void;
  readonly rotulo: string;
}) {
  const pathname = usePathname();
  const busca = useSearchParams();
  if (leitura.estado === "carregando") {
    return <Esqueleto linhas={3} rotulo={rotulo} />;
  }
  if (leitura.estado === "sessao") {
    const volta = `${pathname}${busca.toString() === "" ? "" : `?${busca.toString()}`}`;
    return (
      <Aviso tom="info">
        Sua sessão acabou. <a href={comDestino("/entrar", volta)}>Entre de novo</a> para ver sua conta.
      </Aviso>
    );
  }
  return (
    <Erro
      titulo="Não deu para carregar agora"
      mensagem="Tente de novo em instantes. Nada foi alterado na sua conta."
      acao={
        <Botao type="button" variante="secundaria" onClick={tentarDeNovo}>
          Tentar de novo
        </Botao>
      }
    />
  );
}

function ConteudoDoModal({
  aba,
  aoTrocar,
  fechar,
  email,
  acoes,
}: {
  readonly aba: AbaDaConta;
  readonly aoTrocar: (aba: AbaDaConta) => void;
  readonly fechar: () => void;
  readonly email: string;
  readonly acoes: AcoesDoServidorDaConta;
}) {
  const roteador = useRouter();
  const busca = useSearchParams();

  // Uma aba só carrega quando é aberta pela primeira vez; depois fica pronta.
  const [visitadas, setVisitadas] = useState<readonly AbaDaConta[]>([aba]);
  useEffect(() => {
    setVisitadas((antes) => (antes.includes(aba) ? antes : [...antes, aba]));
  }, [aba]);
  const carregada = (id: AbaDaConta): boolean => id === aba || visitadas.includes(id);

  const dados = useLeitura<Dados>(true, "dados", lerDadosDaConta);
  const aceites = useLeitura<SituacaoDosAceites>(carregada("dados"), "aceites", lerAceitesDaConta);
  const sessoes = useLeitura<readonly SessaoAberta[]>(carregada("seguranca"), "sessoes", lerSessoesAbertas);

  // Leitura de outra conta (a pessoa trocou de conta em outra aba): descarta.
  const leituraDeDados: Leitura<Dados> =
    dados.leitura.estado === "ok" && dados.leitura.dados.email !== email
      ? { estado: "sessao" }
      : dados.leitura;

  function comDados(abrir: (d: Dados) => ReactNode): ReactNode {
    return leituraDeDados.estado === "ok" ? (
      abrir(leituraDeDados.dados)
    ) : (
      <EstadoDaLeitura leitura={leituraDeDados} tentarDeNovo={dados.tentarDeNovo} rotulo="Carregando seus dados…" />
    );
  }

  const sessoesDoPainel: SessoesDoPainel =
    sessoes.leitura.estado === "ok"
      ? { estado: "ok", dados: sessoes.leitura.dados }
      : sessoes.leitura.estado === "carregando"
        ? { estado: "carregando" }
        : { estado: "erro" };

  const paineis: Record<AbaDaConta, ReactNode> = {
    dados: comDados((d) => (
      <div className="sc-minha-conta__blocos">
        <Cartao
          nivelDoTitulo={3}
          icone={<IconeUsuario />}
          titulo="Meus dados"
          descricao="Seu cadastro vale para todas as lojas. Mantenha o telefone em dia para a loja falar com você sobre o pedido."
        >
          <DadosDaConta inicial={d} aoSalvar={() => roteador.refresh()} />
        </Cartao>
        <Cartao
          nivelDoTitulo={3}
          icone={<IconeConfirmar />}
          titulo="Privacidade: seus aceites e cookies"
          descricao="Os documentos que você aceitou, com versão e data, e as suas escolhas de cookies."
        >
          {aceites.leitura.estado === "ok" ? (
            <HistoricoDeConsentimentos situacao={aceites.leitura.dados} antesDeMudarCookies={fechar} />
          ) : (
            <EstadoDaLeitura leitura={aceites.leitura} tentarDeNovo={aceites.tentarDeNovo} rotulo="Carregando seus aceites…" />
          )}
        </Cartao>
        <Cartao
          nivelDoTitulo={3}
          icone={<IconeMenu />}
          titulo="Baixar meus dados"
          descricao="Um arquivo com tudo o que guardamos sobre você: cadastro, endereços, pedidos, favoritos e aceites."
        >
          <ExportarMeusDados />
        </Cartao>
      </div>
    )),
    enderecos: carregada("enderecos") ? (
      <Cartao
        nivelDoTitulo={3}
        icone={<IconeLocal />}
        titulo="Meus endereços"
        descricao="Cadastre uma vez e use em qualquer loja. O endereço padrão chega preenchido — e editável — quando você fecha um pedido."
      >
        <EnderecosSalvos />
      </Cartao>
    ) : null,
    seguranca: comDados((d) => (
      <PainelDeSeguranca
        comAplicativo={d.aplicativoAutenticador}
        sessoes={sessoesDoPainel}
        acaoFalhou={busca.get(PARAMETRO_DE_ESTADO) === "erro"}
        acoes={acoes}
      />
    )),
  };

  return (
    <Abas
      id="minha-conta"
      rotulo="Configurações da conta"
      className="sc-conta-modal__abas"
      ativa={aba}
      aoTrocar={(id) => {
        const proxima = lerAbaDaConta(id);
        if (proxima !== null) aoTrocar(proxima);
      }}
      abas={ABAS_DA_CONTA.map((id) => ({
        id,
        rotulo: ROTULO_DA_ABA[id],
        painel: carregada(id) ? paineis[id] : null,
      }))}
    />
  );
}

export function ModalDaConta({ email, acoes }: ModalDaContaProps) {
  const busca = useSearchParams();
  const abaDoEndereco = lerAbaDaConta(busca.get(PARAMETRO_DA_CONTA));
  // Começa fechado e abre num efeito, mesmo no link profundo: o modo estrito do
  // desenvolvimento monta, desmonta e monta de novo, e uma `Gaveta` que já
  // nasce aberta é fechada pelo desmonte falso (o `close` do `dialog` chega
  // depois e o `onClose` dela fecharia o modal).
  const [aba, setAba] = useState<AbaDaConta | null>(null);
  // O endereço manda: link profundo, "voltar" e "avançar" abrem e fecham.
  useEffect(() => {
    setAba(abaDoEndereco);
  }, [abaDoEndereco]);

  const gatilho = useRef<HTMLElement | null>(null);
  /** Esta abertura empurrou uma entrada no histórico (fechar volta uma). */
  const empurrou = useRef(false);

  const abrir = useCallback((pedida: AbaDaConta) => {
    setAba(pedida);
    window.history.pushState(null, "", enderecoComAba(pedida));
    empurrou.current = true;
  }, []);

  const trocar = useCallback((pedida: AbaDaConta) => {
    setAba(pedida);
    window.history.replaceState(null, "", enderecoComAba(pedida));
  }, []);

  const fechar = useCallback(() => {
    setAba(null);
    if (empurrou.current) {
      empurrou.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", enderecoComAba(null));
    }
  }, []);

  // O gatilho: qualquer link com `data-abre-conta`, sem tecla de atalho.
  useEffect(() => {
    function aoClicar(evento: MouseEvent) {
      if (evento.defaultPrevented || evento.button !== 0) return;
      if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
      const alvo =
        evento.target instanceof Element
          ? evento.target.closest<HTMLElement>("[data-abre-conta]")
          : null;
      if (alvo === null) return;
      const pedida = lerAbaDaConta(alvo.getAttribute("data-abre-conta"));
      if (pedida === null) return;
      evento.preventDefault();
      gatilho.current = alvo;
      if (aba === null) abrir(pedida);
      else trocar(pedida);
    }
    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, [aba, abrir, trocar]);

  // Ao fechar, o foco volta a quem abriu; se esse item sumiu (o painel do menu
  // do avatar fecha ao clicar) ou foi um link profundo, volta ao avatar do topo.
  const estavaAberto = useRef(aba !== null);
  useEffect(() => {
    if (estavaAberto.current && aba === null) {
      const quem = gatilho.current;
      const alvo =
        quem !== null && quem.isConnected && quem.closest("[hidden]") === null
          ? quem
          : document.querySelector<HTMLElement>("[data-menu-da-conta]");
      alvo?.focus();
    }
    estavaAberto.current = aba !== null;
  }, [aba]);

  return (
    <Gaveta
      id="minha-conta-janela"
      aberta={aba !== null}
      titulo="Minha conta"
      lado="direita"
      className="sc-conta-modal"
      aoFechar={fechar}
    >
      {aba === null ? null : (
        <ConteudoDoModal aba={aba} aoTrocar={trocar} fechar={fechar} email={email} acoes={acoes} />
      )}
    </Gaveta>
  );
}
