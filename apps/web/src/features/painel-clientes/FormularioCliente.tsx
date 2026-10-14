"use client";

/**
 * O cadastro e a correção da ficha do cliente (AC-703, AC-704, AC-705, AC-706).
 *
 * NOME E TELEFONE BASTAM. E-mail, endereço e observação são opcionais, e o
 * endereço fica fechado até o dono pedir — no balcão, com o telefone tocando,
 * sete campos na cara são sete motivos para não cadastrar.
 *
 * REPETIDO VIRA ATALHO, E NÃO ERRO. Quando o telefone (ou o e-mail) já é de
 * um cliente, a tela diz QUEM é e oferece abrir a ficha dele — em vez de o dono
 * cadastrar de novo com um dígito trocado. Quando o existente tem conta na
 * plataforma, a frase diz isso (AC-706).
 *
 * O que foi digitado sobrevive a qualquer recusa.
 */
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Aviso, Botao, Campo } from "@simpleclick/ui";

import type {
  ClienteExistente,
  FichaDoCliente,
  ResultadoDaFicha,
} from "../../lib/clientes-do-painel.ts";

/** O que o formulário manda: o formato do cadastro no contrato. */
export interface DadosDoCliente {
  readonly nome: string;
  readonly telefone: string;
  readonly email: string | null;
  readonly endereco: {
    readonly logradouro: string;
    readonly numero: string | null;
    readonly complemento: string | null;
    readonly bairro: string | null;
    readonly cidade: string | null;
    readonly estado: string | null;
  } | null;
  readonly observacao: string | null;
}

export interface FormularioClienteProps {
  readonly titulo: string;
  /** A ficha atual, na correção. Ausente é cadastro novo. */
  readonly inicial?: FichaDoCliente | undefined;
  readonly enviar: (dados: DadosDoCliente) => Promise<ResultadoDaFicha>;
  readonly aoSalvar: (ficha: FichaDoCliente) => void;
}

function textoOuNulo(valor: string): string | null {
  const aparado = valor.trim();
  return aparado === "" ? null : aparado;
}

function fraseDoExistente(existente: ClienteExistente): string {
  const pelo =
    existente.motivo === "TELEFONE" ? "com este telefone" : "com este e-mail";
  return existente.vinculo === "CONTA"
    ? `${existente.nome} já é seu cliente ${pelo}, e tem conta na plataforma. Abra a ficha dele em vez de cadastrar de novo.`
    : `Já existe um cliente ${pelo}: ${existente.nome}. Abra o cadastro existente em vez de duplicar.`;
}

export function FormularioCliente({
  titulo,
  inicial,
  enviar,
  aoSalvar,
}: FormularioClienteProps) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [telefone, setTelefone] = useState(inicial?.telefone ?? "");
  const [email, setEmail] = useState(inicial?.email ?? "");
  const [comEndereco, setComEndereco] = useState(inicial?.endereco != null);
  const [logradouro, setLogradouro] = useState(
    inicial?.endereco?.logradouro ?? "",
  );
  const [numero, setNumero] = useState(inicial?.endereco?.numero ?? "");
  const [complemento, setComplemento] = useState(
    inicial?.endereco?.complemento ?? "",
  );
  const [bairro, setBairro] = useState(inicial?.endereco?.bairro ?? "");
  const [cidade, setCidade] = useState(inicial?.endereco?.cidade ?? "");
  const [estado, setEstado] = useState(inicial?.endereco?.estado ?? "");
  const [observacao, setObservacao] = useState(inicial?.observacao ?? "");

  const [enviando, setEnviando] = useState(false);
  const [recusas, setRecusas] = useState<Readonly<Record<string, string>>>({});
  const [existente, setExistente] = useState<ClienteExistente | null>(null);
  const [falhou, setFalhou] = useState(false);

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const faltando: Record<string, string> = {};
    if (nome.trim().length < 2) faltando.nome = "Informe o nome do cliente.";
    if (telefone.trim() === "") {
      faltando.telefone = "Informe o telefone, com o código de área.";
    }
    if (comEndereco && logradouro.trim() === "") {
      faltando.logradouro = "Informe a rua, ou feche o endereço.";
    }
    setRecusas(faltando);
    setExistente(null);
    setFalhou(false);
    if (Object.keys(faltando).length > 0) return;

    setEnviando(true);
    const resultado = await enviar({
      nome: nome.trim(),
      telefone: telefone.trim(),
      email: textoOuNulo(email),
      endereco: comEndereco
        ? {
            logradouro: logradouro.trim(),
            numero: textoOuNulo(numero),
            complemento: textoOuNulo(complemento),
            bairro: textoOuNulo(bairro),
            cidade: textoOuNulo(cidade),
            estado: textoOuNulo(estado)?.toUpperCase() ?? null,
          }
        : null,
      observacao: textoOuNulo(observacao),
    });
    setEnviando(false);

    switch (resultado.estado) {
      case "salvo":
        aoSalvar(resultado.ficha);
        return;
      case "existente":
        setExistente(resultado.existente);
        return;
      case "recusado":
        setRecusas(resultado.campos);
        return;
      case "erro":
        setFalhou(true);
        return;
    }
  }

  const prefixo = inicial ? `ficha-${inicial.id}` : "novo-cliente";

  return (
    <form
      aria-label={titulo}
      className="grid gap-4 rounded-[var(--raio-cartao)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)] shadow-[var(--sombra-larga)] p-5"
      noValidate
      onSubmit={(evento) => void aoEnviar(evento)}
    >
      <h3 className="text-xl font-semibold">{titulo}</h3>

      {existente !== null ? (
        <Aviso
          tom="atencao"
          titulo="Este cliente já está cadastrado"
          acao={
            <Link
              className="sc-botao sc-botao--secundaria"
              href={`/painel/clientes/${existente.clienteId}`}
            >
              Abrir cadastro de {existente.nome}
            </Link>
          }
        >
          {fraseDoExistente(existente)}
        </Aviso>
      ) : null}
      {falhou ? (
        <Aviso tom="erro">
          Não foi possível salvar agora. O que você digitou continua aqui —
          tente de novo.
        </Aviso>
      ) : null}

      <Campo
        id={`${prefixo}-nome`}
        rotulo="Nome"
        obrigatorio
        autoComplete="off"
        value={nome}
        onChange={(evento) => setNome(evento.target.value)}
        erro={recusas.nome}
      />
      <Campo
        id={`${prefixo}-telefone`}
        rotulo="Telefone"
        obrigatorio
        type="tel"
        inputMode="tel"
        dica="Com o código de área. A pontuação não importa."
        value={telefone}
        onChange={(evento) => setTelefone(evento.target.value)}
        erro={recusas.telefone}
      />
      <Campo
        id={`${prefixo}-email`}
        rotulo="E-mail (opcional)"
        type="email"
        inputMode="email"
        value={email}
        onChange={(evento) => setEmail(evento.target.value)}
        erro={recusas.email}
      />

      <div>
        <Botao
          variante="discreta"
          tamanho="pequeno"
          aria-expanded={comEndereco}
          onClick={() => setComEndereco((aberto) => !aberto)}
        >
          {comEndereco ? "Tirar o endereço" : "Anotar endereço (opcional)"}
        </Botao>
      </div>
      {comEndereco ? (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Endereço do cliente</legend>
          <Campo
            id={`${prefixo}-logradouro`}
            rotulo="Rua"
            className="sm:col-span-2"
            value={logradouro}
            onChange={(evento) => setLogradouro(evento.target.value)}
            erro={recusas.logradouro ?? recusas.endereco}
          />
          <Campo
            id={`${prefixo}-numero`}
            rotulo="Número"
            value={numero}
            onChange={(evento) => setNumero(evento.target.value)}
          />
          <Campo
            id={`${prefixo}-complemento`}
            rotulo="Complemento"
            value={complemento}
            onChange={(evento) => setComplemento(evento.target.value)}
          />
          <Campo
            id={`${prefixo}-bairro`}
            rotulo="Bairro"
            value={bairro}
            onChange={(evento) => setBairro(evento.target.value)}
          />
          <Campo
            id={`${prefixo}-cidade`}
            rotulo="Cidade"
            value={cidade}
            onChange={(evento) => setCidade(evento.target.value)}
          />
          <Campo
            id={`${prefixo}-estado`}
            rotulo="UF"
            maxLength={2}
            value={estado}
            onChange={(evento) => setEstado(evento.target.value)}
          />
        </fieldset>
      ) : null}

      <Campo
        id={`${prefixo}-observacao`}
        rotulo="Observação (opcional)"
        dica="O que ajuda a atender: portão, ponto de referência, preferência."
        value={observacao}
        onChange={(evento) => setObservacao(evento.target.value)}
      />

      <div>
        <Botao type="submit" carregando={enviando} rotuloDeEspera="Salvando…">
          {inicial ? "Salvar correção" : "Cadastrar cliente"}
        </Botao>
      </div>
    </form>
  );
}
