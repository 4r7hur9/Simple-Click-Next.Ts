"use client";

/**
 * A equipe da loja, só para o dono (card #32).
 *
 * O dono cadastra quem trabalha com ele (nome, e-mail e a senha inicial que
 * ele mesmo define), desativa e reativa o acesso, troca a senha (a API derruba
 * as sessões da pessoa) e remove. O plano limita quantas pessoas cabem: a
 * barra "Equipe 1 de 1" mostra o uso e, no limite, o botão de adicionar fica
 * desligado com a frase do suporte. A tela também diz o que a equipe pode
 * fazer, para o dono saber o que está liberando.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Aviso,
  Botao,
  Campo,
  Carregando,
  Dialogo,
  Erro,
  IconeAdicionar,
  IconeExcluir,
  IconeSeguranca,
  Selo,
  Tabela,
  Vazio,
  type ColunaDaTabela,
} from "@simpleclick/ui";
import {
  MATRIZ_DE_PERMISSOES,
  ROTULOS_DAS_PERMISSOES,
} from "@simpleclick/contracts";

import {
  cadastrarMembro,
  lerEquipe,
  mudarAcesso,
  removerMembro,
  trocarSenhaDoMembro,
  type Buscar,
  type EquipeLida,
  type MembroDaEquipe,
  type ResultadoDaAcao,
} from "../../lib/equipe-do-painel.ts";
import { EXPLICACOES } from "../config/explicacoes-do-painel.ts";
import { InfoDoPainel } from "../config/RotuloComInfo.tsx";

type Estado =
  | { readonly tipo: "carregando" }
  | { readonly tipo: "erro" }
  | { readonly tipo: "sem-permissao" }
  | { readonly tipo: "ok"; readonly equipe: EquipeLida };

type Dialogo =
  | { readonly tipo: "nenhum" }
  | { readonly tipo: "novo" }
  | { readonly tipo: "senha"; readonly membro: MembroDaEquipe }
  | { readonly tipo: "remover"; readonly membro: MembroDaEquipe };

const FORMATO_DE_DATA = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const PERMISSOES_DA_EQUIPE = MATRIZ_DE_PERMISSOES.STAFF.map(
  (p) => ROTULOS_DAS_PERMISSOES[p],
);

export interface PainelDaEquipeProps {
  readonly buscar?: Buscar | undefined;
}

export function PainelDaEquipe({ buscar = fetch }: PainelDaEquipeProps) {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [dialogo, setDialogo] = useState<Dialogo>({ tipo: "nenhum" });
  const [aviso, setAviso] = useState<{
    tom: "sucesso" | "erro";
    texto: string;
  } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const leitura = await lerEquipe(buscar);
    setEstado(
      leitura.estado === "ok"
        ? { tipo: "ok", equipe: leitura.equipe }
        : { tipo: leitura.estado },
    );
  }, [buscar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function alternarAcesso(membro: MembroDaEquipe) {
    setOcupado(membro.id);
    setAviso(null);
    const r = await mudarAcesso(membro.id, !membro.ativo, buscar);
    setOcupado(null);
    if (r.estado === "recusado") {
      setAviso({ tom: "erro", texto: r.mensagem });
      return;
    }
    setAviso({
      tom: "sucesso",
      texto: membro.ativo ? "Acesso desativado." : "Acesso reativado.",
    });
    await carregar();
  }

  function depoisDe(texto: string) {
    setDialogo({ tipo: "nenhum" });
    setAviso({ tom: "sucesso", texto });
    void carregar();
  }

  if (estado.tipo === "carregando")
    return <Carregando rotulo="Carregando a equipe…" />;
  if (estado.tipo === "sem-permissao") {
    return (
      <Aviso tom="atencao" titulo="Só o dono cuida da equipe">
        Peça para o dono da loja adicionar ou remover pessoas.
      </Aviso>
    );
  }
  if (estado.tipo === "erro") {
    return (
      <Erro
        titulo="Não foi possível carregar a equipe"
        mensagem="O serviço não respondeu agora."
        acao={
          <Botao variante="secundaria" onClick={() => void carregar()}>
            Tentar de novo
          </Botao>
        }
      />
    );
  }

  const { membros, limite } = estado.equipe;
  const noLimite = limite.uso >= limite.limite;
  const porcento =
    limite.limite === 0
      ? 100
      : Math.min(100, Math.round((limite.uso / limite.limite) * 100));
  const temEquipe = membros.some((m) => m.papel === "STAFF");

  const colunas: readonly ColunaDaTabela<MembroDaEquipe>[] = [
    {
      chave: "nome",
      titulo: "Pessoa",
      valorParaOrdenar: (m) => m.nome ?? m.email,
      celula: (m) => (
        <span className="flex flex-col">
          <strong>{m.nome ?? m.email}</strong>
          <span className="text-sm text-[var(--cor-tinta-suave)]">
            {m.email}
          </span>
        </span>
      ),
    },
    {
      chave: "papel",
      titulo: "Função",
      celula: (m) =>
        m.papel === "OWNER" ? (
          <Selo tom="info" semBolinha>
            Dono
          </Selo>
        ) : (
          <Selo tom="neutro" semBolinha>
            Equipe
          </Selo>
        ),
    },
    {
      chave: "status",
      titulo: "Acesso",
      celula: (m) =>
        m.ativo ? (
          <Selo tom="sucesso">Ativo</Selo>
        ) : (
          <Selo tom="atencao">Desativado</Selo>
        ),
    },
    {
      chave: "desde",
      titulo: "Na equipe desde",
      valorParaOrdenar: (m) => m.desde,
      celula: (m) => FORMATO_DE_DATA.format(new Date(m.desde)),
    },
    {
      chave: "acoes",
      titulo: "Ações",
      alinhamento: "fim",
      celula: (m) =>
        m.papel === "OWNER" ? null : (
          <span className="inline-flex flex-wrap justify-end gap-2">
            <Botao
              tamanho="pequeno"
              variante="secundaria"
              carregando={ocupado === m.id}
              onClick={() => void alternarAcesso(m)}
            >
              {m.ativo ? "Desativar" : "Reativar"}
            </Botao>
            {m.contaGerenciada ? (
              <Botao
                tamanho="pequeno"
                variante="secundaria"
                icone={<IconeSeguranca />}
                onClick={() => setDialogo({ tipo: "senha", membro: m })}
              >
                Trocar senha
              </Botao>
            ) : null}
            <Botao
              tamanho="pequeno"
              variante="perigo"
              icone={<IconeExcluir />}
              onClick={() => setDialogo({ tipo: "remover", membro: m })}
            >
              Remover
            </Botao>
          </span>
        ),
    },
  ];

  return (
    <section aria-labelledby="titulo-equipe" className="grid gap-8">
      <div className="grid gap-6 rounded-3xl border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-6 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="titulo-equipe" className="text-lg font-semibold">
              Equipe {limite.uso} de {limite.limite}
            </h2>
            <InfoDoPainel explicacao="limiteDaEquipe" nome="Limite da equipe" />
          </div>
          <div
            role="progressbar"
            aria-label="Pessoas na equipe"
            aria-valuemin={0}
            aria-valuemax={limite.limite}
            aria-valuenow={limite.uso}
            className="mt-3 h-3 w-full max-w-md overflow-hidden rounded-full bg-[var(--cor-superficie-alta)]"
          >
            <div
              className="h-full rounded-full bg-[var(--cor-primaria)]"
              style={{ width: `${porcento}%` }}
            />
          </div>
          {noLimite ? (
            <p
              className="mt-3 text-sm text-[var(--cor-atencao)]"
              data-limite="atingido"
            >
              Limite do seu plano atingido, fale com o suporte
            </p>
          ) : null}
        </div>
        <Botao
          icone={<IconeAdicionar />}
          desabilitado={noLimite}
          onClick={() => {
            setAviso(null);
            setDialogo({ tipo: "novo" });
          }}
        >
          Adicionar pessoa
        </Botao>
      </div>

      {aviso ? (
        <div aria-live="polite">
          <Aviso tom={aviso.tom === "sucesso" ? "sucesso" : "erro"}>
            {aviso.texto}
          </Aviso>
        </div>
      ) : null}

      {temEquipe ? (
        <Tabela
          legenda="Pessoas com acesso à loja"
          colunas={colunas}
          linhas={membros}
          chaveDaLinha={(m) => m.id}
          estado="pronto"
          noCelular="cartoes"
        />
      ) : (
        <Vazio
          titulo="Você ainda não adicionou ninguém"
          descricao="Adicione uma pessoa para ela atender pedidos e cuidar do catálogo sem ter acesso às configurações."
        />
      )}

      <div className="rounded-3xl border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-6">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">O que a equipe pode fazer</h2>
          <InfoDoPainel explicacao="papelDaEquipe" nome="Dono e Equipe" />
        </div>
        <ul
          className="mt-4 flex flex-wrap gap-2"
          aria-label="Permissões da equipe"
        >
          {PERMISSOES_DA_EQUIPE.map((rotulo) => (
            <li key={rotulo}>
              <Selo tom="sucesso" semBolinha>
                {rotulo}
              </Selo>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-[var(--cor-tinta-suave)]">
          Configurações da loja, equipe, feed e aparência continuam só com você.
        </p>
      </div>

      {dialogo.tipo === "novo" ? (
        <DialogoNovaPessoa
          buscar={buscar}
          aoFechar={() => setDialogo({ tipo: "nenhum" })}
          aoSalvar={() => depoisDe("Pessoa adicionada à equipe.")}
        />
      ) : null}
      {dialogo.tipo === "senha" ? (
        <DialogoSenha
          buscar={buscar}
          membro={dialogo.membro}
          aoFechar={() => setDialogo({ tipo: "nenhum" })}
          aoSalvar={() =>
            depoisDe("Senha trocada. A pessoa saiu de todos os aparelhos.")
          }
        />
      ) : null}
      {dialogo.tipo === "remover" ? (
        <DialogoRemover
          buscar={buscar}
          membro={dialogo.membro}
          aoFechar={() => setDialogo({ tipo: "nenhum" })}
          aoSalvar={() => depoisDe("Pessoa removida da equipe.")}
        />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Diálogos
// ---------------------------------------------------------------------------

interface PropsDoDialogo {
  readonly buscar: Buscar;
  readonly aoFechar: () => void;
  readonly aoSalvar: () => void;
}

function DialogoNovaPessoa({ buscar, aoFechar, aoSalvar }: PropsDoDialogo) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [recusa, setRecusa] = useState<Extract<
    ResultadoDaAcao,
    { estado: "recusado" }
  > | null>(null);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setRecusa(null);
    const r = await cadastrarMembro({ nome, email, senha }, buscar);
    setEnviando(false);
    if (r.estado === "ok") aoSalvar();
    else setRecusa(r);
  }

  return (
    <Dialogo
      id="dialogo-nova-pessoa"
      aberto
      titulo="Adicionar pessoa"
      descricao="Defina a senha inicial e passe para ela. Não precisa confirmar e-mail."
      aoFechar={aoFechar}
    >
      <form className="grid gap-4" onSubmit={(e) => void enviar(e)}>
        <Campo
          id="equipe-nome"
          rotulo="Nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          obrigatorio
          autoComplete="off"
        />
        <Campo
          id="equipe-email"
          rotulo="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          obrigatorio
          autoComplete="off"
          erro={recusa?.motivo === "ja_e_membro" ? recusa.mensagem : undefined}
        />
        <Campo
          id="equipe-senha"
          rotulo="Senha inicial"
          info={EXPLICACOES.senhaInicial}
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          dica="Pelo menos 8 caracteres."
          obrigatorio
          autoComplete="new-password"
          erro={
            recusa?.campo === "senha" || recusa?.motivo === "senha_obrigatoria"
              ? recusa.mensagem
              : undefined
          }
        />
        {recusa &&
        recusa.motivo !== "ja_e_membro" &&
        recusa.campo !== "senha" &&
        recusa.motivo !== "senha_obrigatoria" ? (
          <Aviso tom={recusa.motivo === "limite_atingido" ? "atencao" : "erro"}>
            {recusa.mensagem}
          </Aviso>
        ) : null}
        <div className="flex justify-end gap-2">
          <Botao variante="secundaria" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            type="submit"
            carregando={enviando}
            rotuloDeEspera="Adicionando…"
          >
            Adicionar
          </Botao>
        </div>
      </form>
    </Dialogo>
  );
}

function DialogoSenha({
  buscar,
  membro,
  aoFechar,
  aoSalvar,
}: PropsDoDialogo & { readonly membro: MembroDaEquipe }) {
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [recusa, setRecusa] = useState<string | null>(null);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setRecusa(null);
    const r = await trocarSenhaDoMembro(membro.id, senha, buscar);
    setEnviando(false);
    if (r.estado === "ok") aoSalvar();
    else setRecusa(r.mensagem);
  }

  return (
    <Dialogo
      id="dialogo-trocar-senha"
      aberto
      titulo={`Trocar a senha de ${membro.nome ?? membro.email}`}
      descricao="Ao salvar, a pessoa sai de todos os aparelhos e entra com a senha nova."
      aoFechar={aoFechar}
    >
      <form className="grid gap-4" onSubmit={(e) => void enviar(e)}>
        <Campo
          id="equipe-nova-senha"
          rotulo="Nova senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          dica="Pelo menos 8 caracteres."
          obrigatorio
          autoComplete="new-password"
          erro={recusa ?? undefined}
        />
        <div className="flex justify-end gap-2">
          <Botao variante="secundaria" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" carregando={enviando} rotuloDeEspera="Salvando…">
            Trocar senha
          </Botao>
        </div>
      </form>
    </Dialogo>
  );
}

function DialogoRemover({
  buscar,
  membro,
  aoFechar,
  aoSalvar,
}: PropsDoDialogo & { readonly membro: MembroDaEquipe }) {
  const [enviando, setEnviando] = useState(false);
  const [recusa, setRecusa] = useState<string | null>(null);

  async function remover() {
    setEnviando(true);
    setRecusa(null);
    const r = await removerMembro(membro.id, buscar);
    setEnviando(false);
    if (r.estado === "ok") aoSalvar();
    else setRecusa(r.mensagem);
  }

  return (
    <Dialogo
      id="dialogo-remover-pessoa"
      aberto
      titulo={`Remover ${membro.nome ?? membro.email}?`}
      descricao="A pessoa perde o acesso ao painel da loja agora. A conta dela continua existindo."
      aoFechar={aoFechar}
    >
      <div className="grid gap-4">
        {recusa ? <Aviso tom="erro">{recusa}</Aviso> : null}
        <div className="flex justify-end gap-2">
          <Botao variante="secundaria" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="perigo"
            carregando={enviando}
            rotuloDeEspera="Removendo…"
            onClick={() => void remover()}
          >
            Remover
          </Botao>
        </div>
      </div>
    </Dialogo>
  );
}
