/**
 * Quem do arquivo já é cliente da loja, numa consulta por chave (card #60).
 *
 * As MESMAS regras de `procurarRepetido` (cadastrar.usecase.ts), em lote:
 * telefone pela coluna `phone_key`, e-mail pela ficha (`email`) ou pela
 * conta da plataforma (`app.cliente_da_loja_pelo_email`, 0035); removido e
 * anonimizado não contam; cliente de conta vem antes do manual. Perguntar uma
 * linha por vez seriam 10 mil consultas num arquivo de 5 mil linhas — e a
 * prévia precisa responder enquanto o dono olha para a tela. Três consultas
 * por chamada, de custo linear no tamanho da loja.
 *
 * Roda na transação da loja do contexto: o isolamento por linha garante que
 * cliente de outra loja não aparece.
 */
import { exigirLojaDoContexto } from "../../../core/contexto.ts";
import { transacaoAtual } from "../../../core/db.ts";
import type { ExistenteNaLoja, ExistentesNaLoja } from "./analisar.ts";

interface Linha {
  readonly chave: string;
  readonly id: string;
  readonly display_name: string | null;
  readonly identity_id: string | null;
}

function guardar(
  mapa: Map<string, ExistenteNaLoja>,
  linhas: readonly Linha[],
): void {
  for (const linha of linhas) {
    // A ordem da consulta já põe o cliente de conta (e o mais antigo) antes.
    if (mapa.has(linha.chave)) continue;
    mapa.set(linha.chave, {
      clienteId: linha.id,
      nome: linha.display_name ?? "Cliente sem nome",
      comConta: linha.identity_id !== null,
    });
  }
}

export async function buscarExistentesNaLoja(
  chavesDeTelefone: readonly string[],
  emails: readonly string[],
): Promise<ExistentesNaLoja> {
  const lojaId = exigirLojaDoContexto();
  const tx = transacaoAtual();
  const porTelefone = new Map<string, ExistenteNaLoja>();
  const porEmail = new Map<string, ExistenteNaLoja>();

  // Os da loja inteira, filtrados aqui: uma junção com a lista do arquivo
  // deixa o planejador livre para escolher um laço aninhado que, com alguns
  // milhares de clientes, leva minutos (medido: 50 s num lote de 500).
  const chaves = new Set(chavesDeTelefone);
  if (chaves.size > 0) {
    const linhas = await tx.$queryRaw<Linha[]>`
      SELECT c.phone_key AS chave, c.id, c.display_name, c.identity_id
        FROM app.store_customers c
       WHERE c.store_id = ${lojaId}::uuid
         AND c.phone_key IS NOT NULL
         AND c.removed_at IS NULL
         AND c.anonymized_at IS NULL
       ORDER BY (c.identity_id IS NULL), c.created_at`;
    guardar(
      porTelefone,
      linhas.filter((linha) => chaves.has(linha.chave)),
    );
  }

  const unicos = [...new Set(emails)];
  if (unicos.length > 0) {
    // O e-mail anotado na ficha, do mesmo jeito.
    const procurados = new Set(unicos);
    const daFicha = await tx.$queryRaw<Linha[]>`
      SELECT lower(btrim(c.email)) AS chave, c.id, c.display_name, c.identity_id
        FROM app.store_customers c
       WHERE c.store_id = ${lojaId}::uuid
         AND c.email IS NOT NULL
         AND c.removed_at IS NULL
         AND c.anonymized_at IS NULL
       ORDER BY (c.identity_id IS NULL), c.created_at`;
    guardar(
      porEmail,
      daFicha.filter((linha) => procurados.has(linha.chave)),
    );

    // O e-mail da CONTA de quem já comprou aqui logado: só a função de 0035
    // alcança, sem expor a identidade.
    const daConta = await tx.$queryRaw<Linha[]>`
      SELECT a.email AS chave, c.id, c.display_name, c.identity_id
        FROM (SELECT value AS email,
                     app.cliente_da_loja_pelo_email(value) AS id
                FROM jsonb_array_elements_text(${JSON.stringify(unicos)}::jsonb)) a
        JOIN app.store_customers c ON c.id = a.id
       WHERE c.store_id = ${lojaId}::uuid
         AND c.removed_at IS NULL
         AND c.anonymized_at IS NULL`;
    // Cliente de conta vem antes do manual, como em `procurarRepetido`.
    for (const linha of daConta) {
      const atual = porEmail.get(linha.chave);
      if (atual === undefined || !atual.comConta) porEmail.delete(linha.chave);
    }
    guardar(porEmail, daConta);
  }

  return { porTelefone, porEmail };
}
