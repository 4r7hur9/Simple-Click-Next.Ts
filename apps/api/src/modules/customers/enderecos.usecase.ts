/**
 * Os endereços salvos do comprador (T-707, AC-509, AC-703).
 *
 * O ENDEREÇO É DA PESSOA, E NÃO DA LOJA. Ela cadastra uma vez e usa em
 * qualquer loja onde compre; por isso a tabela não tem `store_id` e fica fora
 * do perímetro do dono (migração 0036). O lojista recebe o endereço COPIADO no
 * contato do pedido, nunca a lista da pessoa.
 *
 * O ISOLAMENTO É POR IDENTIDADE: as políticas só deixam o papel CLIENTE ler e
 * escrever as próprias linhas. Este caso de uso não filtra por dono — quem
 * filtra é o banco, e o `identity_id` gravado vem do contexto, nunca do corpo.
 *
 * UM PADRÃO SÓ. O endereço padrão é o que o fechamento pré-preenche (AC-509).
 * O banco garante um por pessoa (índice único parcial); aqui a troca é feita
 * na ordem que o índice aceita — desmarca o antigo, marca o novo — dentro da
 * mesma transação. O primeiro endereço salvo nasce padrão: quem tem um
 * endereço só não deveria precisar dizer que é esse.
 */
import type {
  EnderecoParaSalvarNoContrato,
  EnderecoSalvoNoContrato,
} from "@simpleclick/contracts";

import { exigirContexto } from "../../core/contexto.ts";
import { transacaoAtual } from "../../core/db.ts";
import { erroDeDominio } from "../../core/erros.ts";

/** O que o banco devolve de um endereço. */
const SELECAO_DO_ENDERECO = {
  id: true,
  label: true,
  recipientName: true,
  street: true,
  number: true,
  complement: true,
  neighborhood: true,
  city: true,
  uf: true,
  zip: true,
  referencePoint: true,
  isDefault: true,
} as const;

interface LinhaDoEndereco {
  readonly id: string;
  readonly label: string | null;
  readonly recipientName: string | null;
  readonly street: string;
  readonly number: string | null;
  readonly complement: string | null;
  readonly neighborhood: string | null;
  readonly city: string | null;
  readonly uf: string | null;
  readonly zip: string | null;
  readonly referencePoint: string | null;
  readonly isDefault: boolean;
}

function comoContrato(linha: LinhaDoEndereco): EnderecoSalvoNoContrato {
  return {
    id: linha.id,
    rotulo: linha.label,
    destinatario: linha.recipientName,
    logradouro: linha.street,
    numero: linha.number,
    complemento: linha.complement,
    bairro: linha.neighborhood,
    cidade: linha.city,
    estado: linha.uf,
    cep: linha.zip,
    pontoDeReferencia: linha.referencePoint,
    padrao: linha.isDefault,
  };
}

/** A pessoa do contexto, no papel de cliente — ou recusa. */
function exigirPessoa(): string {
  const contexto = exigirContexto();
  if (contexto.papel !== "CUSTOMER" || !contexto.usuarioId) {
    throw erroDeDominio("sem_permissao", { recurso: "enderecos" });
  }
  return contexto.usuarioId;
}

/** Texto aparado, ou nulo quando vazio. */
function textoOuNulo(valor: string | null | undefined): string | null {
  const aparado = valor?.trim() ?? "";
  return aparado === "" ? null : aparado;
}

/** Os campos da linha a partir do que a pessoa mandou. */
function camposDaLinha(dados: EnderecoParaSalvarNoContrato) {
  return {
    label: textoOuNulo(dados.rotulo),
    recipientName: textoOuNulo(dados.destinatario),
    street: dados.logradouro.trim(),
    number: textoOuNulo(dados.numero),
    complement: textoOuNulo(dados.complemento),
    neighborhood: textoOuNulo(dados.bairro),
    city: textoOuNulo(dados.cidade),
    uf: textoOuNulo(dados.estado)?.toUpperCase() ?? null,
    zip: textoOuNulo(dados.cep)?.replace(/[^0-9]/g, "") || null,
    referencePoint: textoOuNulo(dados.pontoDeReferencia),
  };
}

/** Os endereços da pessoa, o padrão primeiro. */
export async function listarEnderecos(): Promise<
  readonly EnderecoSalvoNoContrato[]
> {
  const pessoa = exigirPessoa();
  const tx = transacaoAtual();
  const linhas = await tx.customerAddress.findMany({
    where: { identityId: pessoa, anonymizedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: SELECAO_DO_ENDERECO,
  });
  return linhas.map(comoContrato);
}

/** Desmarca o padrão atual, para o índice único aceitar o novo. */
async function desmarcarPadrao(pessoa: string): Promise<void> {
  const tx = transacaoAtual();
  await tx.customerAddress.updateMany({
    where: { identityId: pessoa, isDefault: true },
    data: { isDefault: false },
  });
}

/** Salva um endereço novo. O primeiro da pessoa nasce padrão. */
export async function salvarEndereco(
  dados: EnderecoParaSalvarNoContrato,
): Promise<EnderecoSalvoNoContrato> {
  const pessoa = exigirPessoa();
  const tx = transacaoAtual();

  const jaTem = await tx.customerAddress.count({
    where: { identityId: pessoa, anonymizedAt: null },
  });
  const padrao = dados.padrao === true || jaTem === 0;
  if (padrao) await desmarcarPadrao(pessoa);

  const criado = await tx.customerAddress.create({
    data: { identityId: pessoa, ...camposDaLinha(dados), isDefault: padrao },
    select: SELECAO_DO_ENDERECO,
  });
  return comoContrato(criado);
}

/**
 * Troca um endereço inteiro. Endereço de outra pessoa não existe para esta
 * requisição — a política o esconde — e responde nulo, que vira 404.
 */
export async function trocarEndereco(
  enderecoId: string,
  dados: EnderecoParaSalvarNoContrato,
): Promise<EnderecoSalvoNoContrato | null> {
  const pessoa = exigirPessoa();
  const tx = transacaoAtual();

  const atual = await tx.customerAddress.findFirst({
    where: { id: enderecoId, anonymizedAt: null },
    select: { id: true, isDefault: true },
  });
  if (atual === null) return null;

  // Tirar o padrão do único padrão deixaria a pessoa sem nenhum: o fechamento
  // não saberia o que pré-preencher. Desmarcar só acontece marcando outro.
  const padrao = dados.padrao === true || atual.isDefault;
  if (padrao && !atual.isDefault) await desmarcarPadrao(pessoa);

  const trocado = await tx.customerAddress.update({
    where: { id: atual.id },
    data: { ...camposDaLinha(dados), isDefault: padrao },
    select: SELECAO_DO_ENDERECO,
  });
  return comoContrato(trocado);
}

/**
 * Apaga um endereço da pessoa. Quando era o padrão, o mais antigo que sobra
 * vira padrão — pelo mesmo motivo de não deixar a pessoa sem nenhum.
 */
export async function apagarEndereco(enderecoId: string): Promise<boolean> {
  const pessoa = exigirPessoa();
  const tx = transacaoAtual();

  const atual = await tx.customerAddress.findFirst({
    where: { id: enderecoId },
    select: { id: true, isDefault: true },
  });
  if (atual === null) return false;

  await tx.customerAddress.delete({ where: { id: atual.id } });

  if (atual.isDefault) {
    const proximo = await tx.customerAddress.findFirst({
      where: { identityId: pessoa, anonymizedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (proximo !== null) {
      await tx.customerAddress.update({
        where: { id: proximo.id },
        data: { isDefault: true },
      });
    }
  }
  return true;
}
