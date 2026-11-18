"use client";

/**
 * As peças da tela de Segurança que falam com a API (card #35): trocar a
 * senha, ver e encerrar as conexões abertas, desligar o app autenticador e
 * excluir a conta. Cada ação pede a senha quando mexe no que protege a conta.
 */
import { useState, type FormEvent } from "react";
import { Aviso, Botao, Campo, CampoDeSenha, Selo } from "@simpleclick/ui";
import { PALAVRA_DE_CONFIRMACAO_DA_EXCLUSAO } from "@simpleclick/contracts";

import type { SessaoAberta } from "../../lib/conta-do-cliente.ts";
import { chamarConta } from "./chamar-conta.ts";

type Resultado = { tom: "sucesso" | "erro"; texto: string } | null;

const MENSAGENS: Readonly<Record<string, string>> = {
  senha_incorreta: "A senha está incorreta.",
  senha_fraca: "Essa senha é fraca. Use 12 caracteres ou mais e evite senhas comuns.",
  tem_loja:
    "Você é dono de uma loja. Transfira a loja para outra pessoa ou peça o encerramento dela ao SimpleClick antes de excluir a conta.",
  e_administrador: "Contas da administração não são excluídas por aqui.",
  confirmacao_invalida: "Digite EXCLUIR, em letras maiúsculas, para confirmar.",
};

function texto(erro: string | undefined, mensagem: string | undefined): string {
  return (
    MENSAGENS[erro ?? ""] ?? mensagem ?? "Não foi possível concluir agora. Tente de novo."
  );
}

export function TrocarSenha() {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setResultado(null);
    const r = await chamarConta("POST", "senha", { atual, nova });
    setEnviando(false);
    if (r.ok) {
      setAtual("");
      setNova("");
      setResultado({ tom: "sucesso", texto: "Senha trocada. Os outros aparelhos saem da conta em até 15 minutos; este continua conectado." });
    } else {
      setResultado({ tom: "erro", texto: texto(r.erro, r.erro === "senha_fraca" ? undefined : r.mensagem) });
    }
  }

  return (
    <form className="sc-seguranca__form" aria-label="Trocar senha" noValidate onSubmit={(e) => void enviar(e)}>
      {resultado === null ? null : <Aviso tom={resultado.tom}>{resultado.texto}</Aviso>}
      <CampoDeSenha id="senha-atual" rotulo="Senha atual" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} />
      <CampoDeSenha id="senha-nova" rotulo="Nova senha" mostrarForca autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} />
      <div>
        <Botao type="submit" carregando={enviando} rotuloDeEspera="Trocando…" desabilitado={atual === "" || nova === ""}>
          Trocar senha
        </Botao>
      </div>
    </form>
  );
}

function quando(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function SessoesAbertas({ inicial }: { readonly inicial: readonly SessaoAberta[] }) {
  const [sessoes, setSessoes] = useState(inicial);
  const [falhou, setFalhou] = useState(false);
  /** A conexão sendo encerrada: sem clique duplo (AC-11130). */
  const [encerrando, setEncerrando] = useState<string | null>(null);

  async function encerrar(id: string) {
    if (encerrando !== null) return;
    setFalhou(false);
    setEncerrando(id);
    const r = await chamarConta("DELETE", `sessoes/${id}`);
    setEncerrando(null);
    if (r.ok) setSessoes((atuais) => atuais.filter((s) => s.id !== id));
    else setFalhou(true);
  }

  return (
    <div className="sc-seguranca__sessoes">
      {falhou ? <Aviso tom="erro">Não foi possível encerrar essa conexão. Tente de novo.</Aviso> : null}
      <ul className="sc-sessoes" aria-label="Conexões abertas">
        {sessoes.map((s) => (
          <li key={s.id} className="sc-sessoes__item" data-sessao={s.id}>
            <div>
              <p className="sc-sessoes__nome">
                {s.tipo === "aplicativo" ? "Aplicativo" : "Navegador"}
                {s.atual ? <Selo tom="sucesso">Este aparelho</Selo> : null}
              </p>
              <p className="sc-sessoes__quando">Entrou em {quando(s.iniciadaEm)} · último acesso {quando(s.ultimoAcessoEm)}</p>
            </div>
            {s.atual ? null : (
              <Botao
                variante="secundaria"
                tamanho="pequeno"
                carregando={encerrando === s.id}
                rotuloDeEspera="Encerrando…"
                desabilitado={encerrando !== null}
                onClick={() => void encerrar(s.id)}
              >
                Encerrar
              </Botao>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Pede a senha e confirma uma ação que mexe na proteção da conta. */
function ConfirmarComSenha({
  abrir,
  confirmar,
  perigo = false,
  aviso,
  rotuloDoBotao,
  aoConfirmar,
  palavra,
}: {
  readonly abrir: string;
  readonly confirmar: string;
  readonly perigo?: boolean;
  readonly aviso: string;
  readonly rotuloDoBotao: string;
  readonly aoConfirmar: (senha: string, palavra: string) => Promise<Resultado>;
  /** Confirmação forte: a palavra que a pessoa precisa digitar igual (ex.: EXCLUIR). */
  readonly palavra?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState("");
  const [digitada, setDigitada] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado>(null);

  if (!aberto) {
    return (
      <Botao variante={perigo ? "perigo" : "secundaria"} onClick={() => setAberto(true)}>
        {abrir}
      </Botao>
    );
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setEnviando(true);
    setResultado(await aoConfirmar(senha, digitada));
    setEnviando(false);
  }

  return (
    <form className="sc-seguranca__form" aria-label={confirmar} noValidate onSubmit={(e) => void enviar(e)}>
      <Aviso tom={perigo ? "erro" : "info"}>{aviso}</Aviso>
      {resultado === null ? null : <Aviso tom={resultado.tom}>{resultado.texto}</Aviso>}
      <CampoDeSenha id={`confirmar-${confirmar}`} rotulo="Sua senha" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
      {palavra === undefined ? null : (
        <Campo
          id={`palavra-${confirmar}`}
          rotulo={`Digite ${palavra} para confirmar`}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={digitada}
          onChange={(e) => setDigitada(e.target.value)}
        />
      )}
      <div className="sc-minha-conta__acao">
        <Botao type="submit" variante={perigo ? "perigo" : "primaria"} carregando={enviando} desabilitado={senha === "" || (palavra !== undefined && digitada !== palavra)}>
          {rotuloDoBotao}
        </Botao>
        <Botao variante="discreta" onClick={() => { setAberto(false); setSenha(""); setDigitada(""); setResultado(null); }}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}

export function DesativarAplicativo() {
  const [feito, setFeito] = useState(false);
  if (feito) return <Aviso tom="sucesso">Aplicativo autenticador desativado.</Aviso>;
  return (
    <ConfirmarComSenha
      abrir="Desativar aplicativo autenticador"
      confirmar="desativar-aplicativo"
      aviso="Sem o aplicativo, entrar pede só a senha. Você pode ativar de novo quando quiser."
      rotuloDoBotao="Desativar"
      aoConfirmar={async (senha) => {
        const r = await chamarConta("POST", "aplicativo/desativar", { senha });
        if (r.ok) {
          setFeito(true);
          return null;
        }
        return { tom: "erro", texto: texto(r.erro, r.mensagem) };
      }}
    />
  );
}

export function ExcluirConta({
  sairDepois,
}: {
  /** A ação do servidor que apaga os cookies e leva ao início. */
  readonly sairDepois: () => Promise<void>;
}) {
  return (
    <ConfirmarComSenha
      abrir="Excluir minha conta"
      confirmar="excluir-conta"
      perigo
      aviso="Isso apaga seus dados pessoais (nome, e-mail, telefone, CPF, endereços e favoritos) e desconecta todos os aparelhos. Seus pedidos ficam guardados nas lojas, sem o seu nome, como registro de venda. Não dá para desfazer. Quem tem loja precisa transferi-la ou encerrá-la antes."
      rotuloDoBotao="Excluir para sempre"
      palavra={PALAVRA_DE_CONFIRMACAO_DA_EXCLUSAO}
      aoConfirmar={async (senha, confirmacao) => {
        const r = await chamarConta("POST", "excluir", { senha, confirmacao });
        if (!r.ok) return { tom: "erro", texto: texto(r.erro, r.mensagem) };
        await sairDepois();
        return null;
      }}
    />
  );
}
