/**
 * O que o fechamento precisa saber da loja (AC-505, AC-506, AC-507, AC-510).
 *
 * É A SEGUNDA LISTA DE CAMPOS PERMITIDOS do módulo, e ela existe pelo mesmo
 * motivo da primeira: a linha de configuração guarda, lado a lado, a chave PIX,
 * o WhatsApp do dono, a largura do papel da impressora e os avisos internos.
 * Quem monta a resposta escolhe campo a campo — nunca a linha inteira.
 *
 * A DIFERENÇA PARA A VITRINE É O MOMENTO, e não a permissão. O AC-904 manda a
 * chave PIX não aparecer nos dados públicos da vitrine, e o AC-510 manda ela
 * aparecer quando o cliente escolhe pagar com PIX. Os dois convivem porque a
 * chave não é segredo de quem vai pagar — é segredo de quem está varrendo a
 * plataforma para juntar chaves. Quem abre a vitrine não precisa dela; quem
 * chegou ao fechamento, precisa.
 *
 * A LEITURA VEM DE FUNÇÃO DEDICADA (migração 0019), e não da relação: ler a
 * linha inteira tornaria a impressora e o WhatsApp do dono alcançáveis por
 * quem escrevesse `select: { printing: true }` num caso de uso futuro.
 */
import { transacaoAtual } from "../../core/db.ts";

/** A chave PIX da loja, como o fechamento a mostra (AC-510). */
export interface ChavePix {
  readonly chave: string;
  /** `EMAIL`, `CPF`, `CNPJ`, `TELEFONE`, `ALEATORIA`. */
  readonly tipo: string | null;
  /** O nome de quem recebe — é o que a pessoa confere antes de pagar. */
  readonly titular: string | null;
}

/** O que a loja configurou sobre entrega (AC-506, AC-507). */
export interface EntregaDaLoja {
  readonly aceitaEntrega: boolean;
  readonly aceitaRetirada: boolean;
  /** Taxa única. Zero é taxa zero; NULO é "a combinar" — não é zero. */
  readonly taxaCentavos: number | null;
  /** O nome que o dono deu à linha: "Taxa de entrega", "Frete", "Motoboy". */
  readonly nomeDaTaxa: string | null;
  /** Acima deste subtotal a entrega sai de graça. Nulo: nunca sai. */
  readonly gratisAcimaDeCentavos: number | null;
  readonly minimoParaEntregaCentavos: number | null;
  readonly minimoParaRetiradaCentavos: number | null;
  /** Quanto tempo a loja costuma levar, para a tela dizer o que esperar. */
  readonly prazoMinutos: number | null;
}

/** O que o fechamento da loja oferece. */
export interface FechamentoDaLoja {
  /** `PIX`, `CASH`, `CARD_ON_DELIVERY` — na ordem que o dono definiu. */
  readonly formasDePagamento: readonly string[];
  /** Nula quando a loja não cadastrou, ou não aceita PIX. */
  readonly pix: ChavePix | null;
  readonly entrega: EntregaDaLoja;
  /** Se o dono aceita observação escrita no pedido inteiro. */
  readonly aceitaObservacao: boolean;
}

/** As formas de pagamento que a versão 1 conhece. */
const FORMAS_CONHECIDAS = new Set(["PIX", "CASH", "CARD_ON_DELIVERY"]);

function objeto(valor: unknown): Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}

/**
 * Centavos como número inteiro, ou nulo.
 *
 * NULO NÃO É ZERO, e aqui a diferença é dinheiro: taxa nula é "a combinar" e
 * taxa zero é "não cobro frete". Ler `?? 0` transformaria a primeira na
 * segunda, e a loja passaria a entregar de graça sem ter decidido isso.
 */
function centavos(valor: unknown): number | null {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
  const inteiro = Math.trunc(valor);
  return inteiro < 0 ? null : inteiro;
}

/**
 * As formas de pagamento, filtradas pelo que a versão 1 sabe fazer.
 *
 * Forma desconhecida é DESCARTADA em silêncio, e isso é deliberado: o dono pode
 * ter configurado algo de uma versão futura, e mostrar um botão que a tela não
 * sabe processar quebraria o fechamento no último passo. Descartar deixa o
 * pedido seguir pelas formas que funcionam.
 */
function formasDePagamento(pagamento: Record<string, unknown>): string[] {
  const declaradas = pagamento["formas"];
  if (!Array.isArray(declaradas)) return [];
  return declaradas.filter(
    (forma): forma is string =>
      typeof forma === "string" && FORMAS_CONHECIDAS.has(forma),
  );
}

/**
 * A chave PIX, quando existe E a loja aceita PIX.
 *
 * AS DUAS CONDIÇÕES JUNTAS. Chave cadastrada numa loja que tirou o PIX das
 * formas aceitas não deve sair: o dono desligou o PIX, e devolver a chave
 * assim mesmo é entregar um dado que ele decidiu não usar.
 */
function chavePix(
  pagamento: Record<string, unknown>,
  formas: readonly string[],
): ChavePix | null {
  if (!formas.includes("PIX")) return null;

  const pix = objeto(pagamento["pix"]);
  const chave = texto(pix["chave"]);
  if (chave === null) return null;

  return {
    chave,
    tipo: texto(pix["tipo"]),
    titular: texto(pix["titular"]),
  };
}

function entregaDaLoja(
  entrega: Record<string, unknown>,
  formasDaLoja: readonly string[],
): EntregaDaLoja {
  return {
    // O que a loja ACEITA vem da coluna da loja (`fulfillment_modes`), e não
    // desta configuração: é ela que o resto do sistema já usa, e duas fontes
    // para a mesma pergunta divergem no dia em que uma for editada.
    aceitaEntrega: formasDaLoja.includes("DELIVERY"),
    aceitaRetirada: formasDaLoja.includes("PICKUP"),
    taxaCentavos: centavos(entrega["taxaPadraoCents"]),
    nomeDaTaxa: texto(entrega["nomeDaTaxa"]),
    gratisAcimaDeCentavos: centavos(entrega["gratisAcimaDeCents"]),
    minimoParaEntregaCentavos: centavos(entrega["minimoEntregaCents"]),
    minimoParaRetiradaCentavos: centavos(entrega["minimoRetiradaCents"]),
    prazoMinutos: centavos(entrega["prazoMinutos"]),
  };
}

/**
 * Lê a configuração de fechamento da loja que está no contexto.
 *
 * Devolve `null` quando a loja não tem configuração ou não está ativa — os dois
 * indistinguíveis de fora, e é a rota que os transforma em 404.
 */
export async function fechamentoDaLoja(
  formasDeEntregaDaLoja: readonly string[],
): Promise<FechamentoDaLoja | null> {
  const tx = transacaoAtual();

  const linhas = await tx.$queryRaw<
    { checkout: unknown; delivery: unknown; payment: unknown }[]
  >`SELECT * FROM app.checkout_settings()`;

  const linha = linhas[0];
  if (linha === undefined) return null;

  const pagamento = objeto(linha.payment);
  const formas = formasDePagamento(pagamento);

  return {
    formasDePagamento: formas,
    pix: chavePix(pagamento, formas),
    entrega: entregaDaLoja(objeto(linha.delivery), formasDeEntregaDaLoja),
    // Ausente vale VERDADEIRO: é o comportamento do concorrente e o que o dono
    // espera. Quem quiser desligar terá o interruptor na T-900.
    aceitaObservacao: objeto(linha.checkout)["aceitaObservacao"] !== false,
  };
}

/** A linha de WhatsApp com que a loja recebe pedido (AC-520). */
export interface WhatsAppDaLoja {
  /** Em E.164, como o dono cadastrou. */
  readonly numero: string;
  /** A saudação que abre a mensagem: "Olá! Segue meu pedido:". */
  readonly saudacao: string | null;
}

/**
 * Lê o número com que a loja recebe pedido.
 *
 * FICA SEPARADO DE `fechamentoDaLoja` DE PROPÓSITO, e não por organização. O
 * número NÃO É campo da resposta de fechamento: ele entra apenas embutido no
 * endereço da conversa, e esse endereço só volta para quem ACABOU de criar um
 * pedido.
 *
 * A razão é concreta: na prática o número da loja e o celular do dono são o
 * MESMO — no pequeno negócio, o dono É o WhatsApp da loja. Publicá-lo na
 * vitrine seria publicar o celular pessoal dele para qualquer pessoa que
 * abrisse o endereço, e para todo robô que varresse a plataforma.
 *
 * Função separada torna difícil o acidente de serializá-lo junto de outra
 * coisa: ela devolve o número e nada mais, e quem a chama é uma rota só.
 */
export async function whatsappDaLoja(): Promise<WhatsAppDaLoja | null> {
  const tx = transacaoAtual();

  const linhas = await tx.$queryRaw<
    { whatsapp: unknown }[]
  >`SELECT * FROM app.store_whatsapp()`;

  const bruto = objeto(linhas[0]?.whatsapp);
  const numero = texto(bruto["numero"]);
  if (numero === null) return null;

  return { numero, saudacao: texto(bruto["saudacao"]) };
}
