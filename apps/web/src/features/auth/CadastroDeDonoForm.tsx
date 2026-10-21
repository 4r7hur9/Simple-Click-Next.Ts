"use client";

/**
 * Criar conta de DONO: quem quer vender cadastra a pessoa e a loja numa tela
 * só, em duas etapas curtas.
 *
 * 1. Seus dados (nome, e-mail, WhatsApp e senha) — os mesmos da conta de
 *    cliente, porque a conta de dono nasce como uma conta comum.
 * 2. Sua loja (nome, tipo de negócio, endereço, WhatsApp e cidade).
 *
 * Ao enviar, a conta é criada e a sessão abre; em seguida a loja é cadastrada
 * e nasce AGUARDANDO APROVAÇÃO. Se a conta nasceu e a loja foi recusada
 * (endereço que acabou de ser usado, rede fora), a pessoa já está logada: o
 * formulário guarda isso e, ao reenviar, só tenta a loja de novo.
 */
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Aviso,
  Botao,
  Campo,
  CampoDeSenha,
  descritoresDoCampo,
  Seletor,
} from "@simpleclick/ui";
import { AceiteDosTermos } from "../legal/AceiteDosTermos.tsx";
import { EXPLICACOES_PARA_CLIENTES } from "../loja/explicacoes-para-clientes.ts";

import {
  conferirAntes,
  telefoneComPais,
  type DadosDoCadastroNaTela,
  type RespostaDoCadastroNaTela,
} from "./CadastroForm.tsx";
import type { DadosDaLojaNaTela } from "./acesso-na-ponte.ts";
import {
  apelidoDigitado,
  apelidoDoNome,
  consultarApelido,
  problemaDoApelido,
  type SituacaoDoApelido,
} from "./endereco-da-loja.ts";
import type { RespostaDaLojaNaTela } from "./respostas-de-acesso.ts";

export interface TipoDeNegocioNaTela {
  readonly codigo: string;
  readonly nome: string;
}

export interface CadastroDeDonoFormProps {
  readonly tipos: readonly TipoDeNegocioNaTela[];
  readonly aoCadastrar: (
    dados: DadosDoCadastroNaTela,
  ) => Promise<RespostaDoCadastroNaTela>;
  readonly aoAbrirLoja: (
    dados: DadosDaLojaNaTela,
  ) => Promise<RespostaDaLojaNaTela>;
  /** A conta e a loja foram criadas: a pessoa vai para o painel. */
  readonly aoConcluir: (destino: string) => void;
  /** Link "Entrar" mostrado quando o e-mail já tem conta. */
  readonly linkParaEntrar?: ReactNode;
  readonly prefixo?: string;
  /** Consulta de disponibilidade; entra por parâmetro para as provas. */
  readonly consultar?: (apelido: string) => Promise<SituacaoDoApelido>;
}

const ATRASO_DA_CONSULTA_EM_MS = 400;

export function CadastroDeDonoForm({
  tipos,
  aoCadastrar,
  aoAbrirLoja,
  aoConcluir,
  linkParaEntrar,
  prefixo = "dono",
  consultar = (apelido) => consultarApelido(apelido),
}: CadastroDeDonoFormProps) {
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [aceitouTermosDoLojista, setAceitouTermosDoLojista] = useState(false);

  const [nomeDaLoja, setNomeDaLoja] = useState("");
  const [tipo, setTipo] = useState("");
  const [apelido, setApelido] = useState("");
  const [apelidoEditado, setApelidoEditado] = useState(false);
  const [whatsappDaLoja, setWhatsappDaLoja] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");

  const [situacao, setSituacao] = useState<SituacaoDoApelido>();
  const [consultando, setConsultando] = useState(false);
  const [origem, setOrigem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<ReactNode>();
  /** A conta já nasceu (e a sessão abriu): só a loja falta. */
  const [contaCriada, setContaCriada] = useState(false);
  const consultaAtual = useRef(0);

  useEffect(() => setOrigem(window.location.host), []);

  // O endereço acompanha o nome da loja até a pessoa mexer nele.
  function mudarNomeDaLoja(valor: string) {
    setNomeDaLoja(valor);
    if (!apelidoEditado) setApelido(apelidoDoNome(valor));
  }

  // Confere a disponibilidade um instante depois de a pessoa parar de digitar.
  useEffect(() => {
    setSituacao(undefined);
    if (problemaDoApelido(apelido) !== null) {
      setConsultando(false);
      return;
    }
    const numero = ++consultaAtual.current;
    setConsultando(true);
    const espera = setTimeout(() => {
      void consultar(apelido).then((resultado) => {
        if (numero !== consultaAtual.current) return;
        setSituacao(resultado);
        setConsultando(false);
      });
    }, ATRASO_DA_CONSULTA_EM_MS);
    return () => clearTimeout(espera);
    // `consultar` pode mudar a cada render; só o endereço dispara a consulta.
  }, [apelido]);

  function dadosDaPessoa(): DadosDoCadastroNaTela {
    return {
      nome: nome.trim(),
      email: email.trim(),
      telefone: telefoneComPais(telefone),
      senha,
      aceitouTermos,
    };
  }

  function continuar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroGeral(undefined);
    const achados = conferirAntes(dadosDaPessoa());
    setErros(achados);
    if (Object.keys(achados).length === 0) {
      if (whatsappDaLoja === "") setWhatsappDaLoja(telefone);
      setEtapa(2);
    }
  }

  function conferirLoja(): Record<string, string> {
    const achados: Record<string, string> = {};
    if (nomeDaLoja.trim().length < 2) {
      achados["nome"] = "Informe o nome da loja.";
    }
    if (tipo === "") achados["tipoDeNegocio"] = "Escolha o tipo de negócio.";
    const problema = problemaDoApelido(apelido);
    if (problema !== null) achados["apelido"] = problema;
    else if (consultando) {
      achados["apelido"] = "Aguarde: estamos conferindo o endereço.";
    } else if (situacao?.estado === "ocupado") {
      achados["apelido"] = "Este endereço já está em uso. Escolha outro.";
    } else if (situacao?.estado === "reservado") {
      achados["apelido"] = situacao.mensagem;
    }
    if (uf !== "" && !/^[A-Za-z]{2}$/.test(uf)) {
      achados["uf"] = "Use as duas letras do estado, como SP.";
    }
    if (!aceitouTermosDoLojista) {
      achados["aceitouTermosDoLojista"] =
        "Para abrir a loja, aceite os Termos do Lojista.";
    }
    return achados;
  }

  /** Volta para a etapa 1 mostrando o que a conta recusou. */
  function voltarComErros(novos: Record<string, string>) {
    setErros(novos);
    setEtapa(1);
  }

  /** Cria a conta; devolve `false` quando ela foi recusada. */
  async function criarConta(): Promise<boolean> {
    const conta = await aoCadastrar(dadosDaPessoa());
    if (conta.status === "EMAIL_EM_USO") {
      voltarComErros({ email: conta.mensagem });
      if (linkParaEntrar !== undefined) {
        setErroGeral(
          <>
            {conta.mensagem} {linkParaEntrar}
          </>,
        );
      }
      return false;
    }
    if (conta.status === "SENHA_FRACA") {
      voltarComErros({ senha: conta.mensagem });
      return false;
    }
    if (conta.status === "CAMPOS_INVALIDOS") {
      voltarComErros(
        Object.fromEntries(
          conta.campos.map((item) => [item.campo, item.mensagem]),
        ),
      );
      return false;
    }
    if (conta.status === "INDISPONIVEL") {
      setErroGeral(conta.mensagem);
      return false;
    }
    setContaCriada(true);
    return true;
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroGeral(undefined);
    const achados = conferirLoja();
    setErros(achados);
    if (Object.keys(achados).length > 0) return;

    setEnviando(true);
    let nasceu = contaCriada;
    try {
      if (!nasceu) {
        if (!(await criarConta())) return;
        nasceu = true;
      }

      const loja = await aoAbrirLoja({
        nome: nomeDaLoja.trim(),
        tipoDeNegocio: tipo,
        apelido,
        ...(whatsappDaLoja.trim() === ""
          ? {}
          : { whatsapp: telefoneComPais(whatsappDaLoja) }),
        ...(cidade.trim() === "" ? {} : { cidade: cidade.trim() }),
        ...(uf === "" ? {} : { uf: uf.toUpperCase() }),
        aceitouTermosDoLojista: true,
      });
      if (loja.status === "CRIADA") {
        aoConcluir("/painel");
        return;
      }
      if (loja.status === "APELIDO_EM_USO") {
        setErros({ apelido: loja.mensagem });
        setSituacao({ estado: "ocupado", sugestao: loja.sugestao });
        return;
      }
      if (loja.status === "CAMPOS_INVALIDOS") {
        setErros(
          Object.fromEntries(
            loja.campos.map((item) => [item.campo, item.mensagem]),
          ),
        );
        return;
      }
      setErroGeral(
        loja.status === "SEM_SESSAO"
          ? "Sua sessão terminou. Entre na sua conta e cadastre a loja."
          : loja.mensagem,
      );
    } catch {
      setErroGeral(
        nasceu
          ? "Sua conta foi criada, mas não deu para cadastrar a loja agora. Tente de novo."
          : "Não foi possível criar a conta agora. Tente novamente.",
      );
    } finally {
      setEnviando(false);
    }
  }

  const id = (campo: string) => `${prefixo}-${campo}`;

  if (etapa === 1) {
    return (
      <form
        className="sc-conta__form"
        onSubmit={continuar}
        noValidate
        aria-label="Seus dados"
      >
        <Etapas atual={1} />
        <div className="sc-conta__campos">
          <Campo
            id={id("nome")}
            name="nome"
            autoComplete="name"
            rotulo="Seu nome"
            obrigatorio
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            erro={erros["nome"]}
          />
          <Campo
            id={id("email")}
            name="email"
            type="email"
            autoComplete="email"
            rotulo="E-mail"
            obrigatorio
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            erro={erros["email"]}
          />
          <Campo
            id={id("telefone")}
            name="telefone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            rotulo="Seu WhatsApp com DDD"
            placeholder="(85) 91234-5678"
            obrigatorio
            value={telefone}
            onChange={(evento) => setTelefone(evento.target.value)}
            erro={erros["telefone"]}
          />
          <CampoDeSenha
            id={id("senha")}
            name="senha"
            autoComplete="new-password"
            mostrarForca
            rotulo="Senha"
            dica="Use 12 caracteres ou mais. Uma frase fácil de lembrar funciona bem."
            obrigatorio
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
            erro={erros["senha"]}
          />
          <AceiteDosTermos
            id={id("aceite")}
            marcado={aceitouTermos}
            aoMudar={setAceitouTermos}
            erro={erros["aceitouTermos"]}
          />
        </div>
        {erroGeral ? <Aviso tom="erro">{erroGeral}</Aviso> : null}
        <Botao className="sc-conta__botao" tamanho="grande" type="submit">
          Continuar
        </Botao>
      </form>
    );
  }

  return (
    <form
      className="sc-conta__form"
      onSubmit={(evento) => void enviar(evento)}
      noValidate
      aria-label="Sua loja"
    >
      <Etapas atual={2} />
      <div className="sc-conta__campos">
        <Campo
          id={id("loja-nome")}
          name="nomeDaLoja"
          rotulo="Nome da loja"
          dica="Como os clientes vão ver no topo da loja. Ex.: Pastelaria da Vila."
          obrigatorio
          value={nomeDaLoja}
          onChange={(evento) => mudarNomeDaLoja(evento.target.value)}
          erro={erros["nome"]}
          desabilitado={enviando}
        />
        <Campo
          id={id("tipo")}
          rotulo="Tipo de negócio"
          obrigatorio
          info={EXPLICACOES_PARA_CLIENTES.tipoDeNegocio}
          erro={erros["tipoDeNegocio"]}
          controle={
            <Seletor
              id={id("tipo")}
              name="tipoDeNegocio"
              required
              value={tipo}
              disabled={enviando}
              aria-invalid={erros["tipoDeNegocio"] !== undefined || undefined}
              aria-describedby={descritoresDoCampo(id("tipo"), {
                info: true,
                erro: erros["tipoDeNegocio"],
              }).join(" ")}
              onChange={(valor) => setTipo(valor)}
            >
              <option value="">Escolha…</option>
              {tipos.map((cada) => (
                <option key={cada.codigo} value={cada.codigo}>
                  {cada.nome}
                </option>
              ))}
            </Seletor>
          }
        />
        <Campo
          id={id("apelido")}
          name="apelido"
          rotulo="Link da loja (endereço na internet)"
          info={EXPLICACOES_PARA_CLIENTES.linkDaLoja}
          obrigatorio
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={apelido}
          onChange={(evento) => {
            setApelidoEditado(true);
            setApelido(apelidoDigitado(evento.target.value));
          }}
          dica={
            apelido === ""
              ? "Só letras minúsculas, números e hífen. Ex.: pastelaria-da-vila."
              : `Seu link: ${origem}/loja/${apelido}`
          }
          carregando={consultando}
          rotuloDeEspera="Conferindo se está livre…"
          sucesso={situacao?.estado === "livre" ? "Endereço livre." : undefined}
          erro={
            erros["apelido"] ??
            (situacao?.estado === "ocupado"
              ? "Este endereço já está em uso."
              : situacao?.estado === "reservado"
                ? situacao.mensagem
                : undefined)
          }
          desabilitado={enviando}
        />
        {situacao?.estado === "ocupado" && situacao.sugestao !== null ? (
          <p className="sc-cadastro__sugestao">
            Que tal{" "}
            <button
              type="button"
              className="sc-cadastro__sugestao-botao"
              onClick={() => {
                setApelidoEditado(true);
                setApelido(situacao.sugestao ?? "");
                setErros((atual) => {
                  const { apelido: _, ...resto } = atual;
                  return resto;
                });
              }}
            >
              {situacao.sugestao}
            </button>
            ?
          </p>
        ) : null}
        <Campo
          id={id("whatsapp")}
          name="whatsappDaLoja"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          rotulo="WhatsApp da loja com DDD (opcional)"
          dica="É por onde os clientes falam com você e recebem o pedido. Pode deixar o mesmo número."
          placeholder="(85) 91234-5678"
          value={whatsappDaLoja}
          onChange={(evento) => setWhatsappDaLoja(evento.target.value)}
          erro={erros["whatsapp"]}
          desabilitado={enviando}
        />
        <div className="sc-cadastro__duas-colunas">
          <Campo
            id={id("cidade")}
            name="cidade"
            autoComplete="address-level2"
            rotulo="Cidade (opcional)"
            value={cidade}
            onChange={(evento) => setCidade(evento.target.value)}
            erro={erros["cidade"]}
            desabilitado={enviando}
          />
          <Campo
            id={id("uf")}
            name="uf"
            autoComplete="address-level1"
            rotulo="Estado (UF)"
            placeholder="Ex.: CE"
            maxLength={2}
            value={uf}
            onChange={(evento) => setUf(evento.target.value.toUpperCase())}
            erro={erros["uf"]}
            desabilitado={enviando}
          />
        </div>
        <AceiteDosTermos
          id={id("aceite-lojista")}
          tipo="lojista"
          marcado={aceitouTermosDoLojista}
          aoMudar={setAceitouTermosDoLojista}
          erro={erros["aceitouTermosDoLojista"]}
          desabilitado={enviando}
        />
      </div>
      {erroGeral ? <Aviso tom="erro">{erroGeral}</Aviso> : null}
      <div className="sc-cadastro__acoes">
        {contaCriada ? null : (
          <Botao
            variante="secundaria"
            tamanho="grande"
            type="button"
            onClick={() => {
              setErros({});
              setEtapa(1);
            }}
            desabilitado={enviando}
          >
            Voltar
          </Botao>
        )}
        <Botao
          className="sc-conta__botao"
          tamanho="grande"
          type="submit"
          carregando={enviando}
          rotuloDeEspera="Criando…"
        >
          Criar conta e loja
        </Botao>
      </div>
      <p className="sc-cadastro__nota">
        Depois de criar, a equipe do SimpleClick analisa o cadastro. A loja só
        vai ao ar quando for aprovada.
      </p>
    </form>
  );
}

/** Onde a pessoa está: etapa 1 de 2 ou 2 de 2. */
function Etapas({ atual }: { readonly atual: 1 | 2 }) {
  return (
    <ol className="sc-cadastro__etapas" aria-label="Etapas do cadastro">
      {(["Seus dados", "Sua loja"] as const).map((titulo, indice) => (
        <li
          key={titulo}
          aria-current={atual === indice + 1 ? "step" : undefined}
          data-feita={atual > indice + 1 || undefined}
        >
          <span aria-hidden="true">{indice + 1}</span>
          {titulo}
        </li>
      ))}
    </ol>
  );
}
