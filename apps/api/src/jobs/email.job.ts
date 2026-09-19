/**
 * Trabalho de envio de e-mail em segundo plano (AC-025).
 *
 * Aqui moram três coisas distintas, de propósito separadas:
 *
 * 1. **A porta de saída** (`EnviadorDeEmail`). O domínio conhece apenas "algo
 *    que sabe entregar uma mensagem". Em teste ela é um duplo que conta
 *    chamadas e falha sob comando; em produção é o serviço de e-mail. Nenhum
 *    teste deste projeto fala com serviço externo.
 * 2. **A montagem da mensagem** (`montarEmailDeVerificacao`), que é função pura
 *    e por isso é conferida por comparação, sem fila e sem rede.
 * 3. **O enfileiramento** (`enfileirarEmailDeVerificacao`), que é o que o caso
 *    de uso de cadastro chama — e que devolve em milissegundos, porque só
 *    escreve o pedido na fila.
 *
 * O ponto do critério está na assimetria entre 3 e o processamento: quem
 * responde ao navegador executa 3; quem espera o serviço de e-mail é o
 * trabalhador, noutra linha de execução. Uma falha do lado do trabalhador não
 * tem por onde voltar para a resposta que já foi entregue.
 */

import { type Processor } from "bullmq";

import { type FilaAberta } from "./fila.ts";

/** Nomes dos trabalhos que a fila de e-mail reconhece. */
export const TRABALHOS_DE_EMAIL = {
  verificacaoDeEmail: "email-de-verificacao",
} as const;

/** Mensagem pronta para entrega, no formato que a porta de saída recebe. */
export interface MensagemDeEmail {
  readonly destinatario: string;
  readonly assunto: string;
  readonly corpo: string;
}

/**
 * Porta de saída de e-mail.
 *
 * Quem implementar contra um serviço real tem duas obrigações: lançar erro
 * quando a entrega não aconteceu — é o erro que dispara a repetição (AC-026) —
 * e não escrever endereço, telefone nem qualquer dado pessoal na mensagem
 * desse erro, porque ela vai para o registro do servidor (P-009).
 */
export interface EnviadorDeEmail {
  enviar(mensagem: MensagemDeEmail): Promise<void>;
}

/** Recusa de envio por adaptador ausente. */
export class ErroDeEnvioNaoConfigurado extends Error {
  constructor() {
    super(
      [
        "Nenhum serviço de e-mail está configurado, então a mensagem não foi entregue.",
        "O trabalho fica na fila em estado falho, inspecionável, e nada se perdeu (AC-026).",
        "Para resolver: escolher o provedor de e-mail, registrar a decisão em",
        ".spec/design/decisoes.md e implementar `EnviadorDeEmail` contra ele,",
        "com as credenciais vindas do ambiente e nunca do código (P-002).",
      ].join(" "),
    );
    this.name = "ErroDeEnvioNaoConfigurado";
  }
}

/**
 * Adaptador de partida, usado enquanto o provedor de e-mail não foi decidido.
 *
 * Falhar alto é melhor do que fingir que enviou: com este adaptador o trabalho
 * esgota as tentativas e fica registrado como falho, e quem for inspecionar a
 * fila lê exatamente o que falta configurar. Um adaptador que engolisse a
 * mensagem em silêncio produziria um sistema que parece funcionar e perde todo
 * e-mail — o pior dos dois mundos.
 */
export function enviadorNaoConfigurado(): EnviadorDeEmail {
  return {
    enviar: () => Promise.reject(new ErroDeEnvioNaoConfigurado()),
  };
}

/** Dados do e-mail que confirma o endereço de quem acabou de se cadastrar. */
export interface DadosDoEmailDeVerificacao {
  readonly destinatario: string;
  readonly nome: string;
  readonly urlDeVerificacao: string;
}

/** Ponte explícita entre o caso de uso e a fila de e-mail. */
export function criarEnfileiradorDeEmailDeVerificacao(
  fila: Pick<FilaAberta<DadosDeEmail>, "enfileirar">,
) {
  return {
    enfileirar: (dados: DadosDoEmailDeVerificacao) =>
      enfileirarEmailDeVerificacao(fila, dados),
  };
}

/** Dados que trafegam na fila de e-mail. */
export type DadosDeEmail = DadosDoEmailDeVerificacao;

/** Assunto do e-mail de verificação, fora da função para o teste comparar. */
export const ASSUNTO_DE_VERIFICACAO = "Confirme seu e-mail no SimpleClick";

/** Monta a mensagem de verificação. Função pura: mesma entrada, mesmo texto. */
export function montarEmailDeVerificacao(
  dados: DadosDoEmailDeVerificacao,
): MensagemDeEmail {
  return {
    destinatario: dados.destinatario,
    assunto: ASSUNTO_DE_VERIFICACAO,
    corpo: [
      `Olá, ${dados.nome}.`,
      "",
      "Confirme seu endereço de e-mail para terminar o cadastro:",
      dados.urlDeVerificacao,
      "",
      "Se não foi você quem se cadastrou, ignore esta mensagem.",
    ].join("\n"),
  };
}

/** Trabalho chegou com um nome que este processador não conhece. */
export class ErroDeTrabalhoDesconhecido extends Error {
  constructor(nome: string) {
    super(
      `A fila de e-mail não conhece o trabalho "${nome}". Nomes válidos: ${Object.values(
        TRABALHOS_DE_EMAIL,
      ).join(", ")}.`,
    );
    this.name = "ErroDeTrabalhoDesconhecido";
  }
}

/**
 * Processador da fila de e-mail: recebe o trabalho e usa a porta de saída.
 *
 * O erro sobe sem tratamento de propósito — é ele que a fila lê para repetir
 * com espera crescente e, esgotadas as tentativas, guardar o trabalho como
 * falho (AC-026). Capturar aqui transformaria falha em sucesso silencioso.
 */
export function criarProcessadorDeEmail(
  enviador: EnviadorDeEmail,
): Processor<DadosDeEmail, void> {
  return async (trabalho) => {
    if (trabalho.name !== TRABALHOS_DE_EMAIL.verificacaoDeEmail) {
      throw new ErroDeTrabalhoDesconhecido(trabalho.name);
    }
    await enviador.enviar(montarEmailDeVerificacao(trabalho.data));
  };
}

/** O que o enfileiramento devolve a quem está respondendo à requisição. */
export type ResultadoDoEnfileiramento =
  | { readonly enfileirado: true; readonly trabalhoId: string }
  | { readonly enfileirado: false; readonly motivo: string };

/**
 * Enfileira o e-mail de verificação e volta — sem esperar entrega nenhuma.
 *
 * Devolve resultado em vez de lançar quando o próprio enfileiramento falha, e
 * isso é decisão, não descuido: se o Redis estiver fora do ar, o cadastro da
 * pessoa não pode falhar por causa do e-mail de confirmação (AC-025). O motivo
 * volta tipado para que quem chamou registre a falha e siga respondendo — o
 * caminho errado seria engolir em silêncio, e por isso o resultado obriga a
 * olhar.
 *
 * O reenvio manual continua existindo como saída para a pessoa que não recebeu,
 * e é o que fecha o buraco que este caminho aceita deixar aberto.
 */
export async function enfileirarEmailDeVerificacao(
  fila: Pick<FilaAberta<DadosDeEmail>, "enfileirar">,
  dados: DadosDoEmailDeVerificacao,
): Promise<ResultadoDoEnfileiramento> {
  try {
    const trabalho = await fila.enfileirar(
      TRABALHOS_DE_EMAIL.verificacaoDeEmail,
      dados,
    );
    return { enfileirado: true, trabalhoId: String(trabalho.id ?? "") };
  } catch (erro) {
    return {
      enfileirado: false,
      motivo: erro instanceof Error ? erro.message : String(erro),
    };
  }
}
