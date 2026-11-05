# LGPD na prática de engenharia

Lei 13.709/2018. Este guia traduz a lei em decisões técnicas. Não substitui orientação jurídica: quando a spec não define base legal, prazo de retenção ou papel (controlador/operador), registre como dúvida para o dono do produto.

## Conceitos que mudam o código

| Conceito | O que é | Impacto técnico |
|---|---|---|
| Dado pessoal | Informação sobre pessoa natural identificada ou identificável | Nome, e-mail, telefone, CPF, endereço, IP, ID de dispositivo, histórico de compras vinculado a pessoa |
| Dado pessoal sensível (art. 5º, II) | Origem racial ou étnica, convicção religiosa, opinião política, filiação sindical ou a organização religiosa, filosófica ou política, saúde, vida sexual, genético, biométrico | Evitar coletar; se necessário, base legal específica (art. 11), controle de acesso e criptografia reforçados |
| Anonimizado | Não pode mais ser associado à pessoa por meios razoáveis | Deixa de ser dado pessoal. Hash de CPF não é anonimização: o espaço é pequeno e reversível por força bruta |
| Pseudonimizado | Associação só possível com informação adicional guardada à parte | Continua sendo dado pessoal |
| Controlador | Decide finalidade e meios | Em SaaS B2B, a loja (tenant) costuma ser controladora dos dados dos clientes dela |
| Operador | Trata em nome do controlador | O SaaS costuma ser operador dos dados dos clientes da loja e controlador dos dados das próprias contas e cobranças |
| Encarregado | Canal com titulares e ANPD | Contato publicado; pedidos de titulares chegam por ele |

Consequência do papel de operador: pedidos de titulares sobre dados de clientes da loja geralmente são atendidos pela loja, com ferramentas que o SaaS fornece (exportar, corrigir, anonimizar cliente).

## Princípios (art. 6º) como requisitos

- **Finalidade e adequação**: cada campo tem um propósito declarado. Campo "por via das dúvidas" não entra.
- **Necessidade (minimização)**: colete o mínimo. Data de nascimento completa só se a regra precisa; às vezes basta o mês (campanha de aniversário).
- **Livre acesso e transparência**: o titular consegue saber o que há sobre ele.
- **Qualidade**: permitir correção.
- **Segurança e prevenção**: controles técnicos proporcionais ao risco.
- **Responsabilização**: registrar decisões e evidências (registro de operações, logs de acesso, ADRs).

## Bases legais (art. 7º)

1. Consentimento.
2. Cumprimento de obrigação legal ou regulatória (ex.: dados em documento fiscal).
3. Execução de políticas públicas pela administração pública.
4. Estudos por órgão de pesquisa.
5. Execução de contrato ou procedimentos preliminares a pedido do titular (ex.: dados para entregar a compra).
6. Exercício regular de direitos em processo.
7. Proteção da vida ou da incolumidade física.
8. Tutela da saúde, por profissionais ou serviços de saúde.
9. Legítimo interesse do controlador ou de terceiro, respeitados os direitos do titular.
10. Proteção do crédito.

Regras práticas:
- Marketing (WhatsApp promocional, e-mail de ofertas): em geral consentimento ou legítimo interesse com opt-out fácil; decida com o jurídico e registre.
- Consentimento precisa ser livre, informado, inequívoco e para finalidade determinada. Guarde prova: quem, quando, qual texto/versão, qual finalidade, canal. Revogação tão fácil quanto dar.
- Não use consentimento como base quando a operação não pode ser recusada (ex.: dados obrigatórios da nota fiscal).

## Direitos do titular (art. 18) e implementação

| Direito | Implementação mínima |
|---|---|
| Confirmação e acesso | Consulta de todos os dados do titular por ID, no escopo do tenant |
| Correção | Edição dos campos pessoais com trilha de auditoria |
| Anonimização, bloqueio ou eliminação de dados desnecessários ou em desconformidade | Rotina de anonimização por titular |
| Portabilidade | Exportação em formato estruturado e legível (JSON ou CSV) |
| Eliminação dos dados tratados com consentimento | Exclusão ou anonimização, respeitando retenções legais (art. 16) |
| Informação sobre compartilhamento | Lista de operadores e terceiros que recebem os dados |
| Revogação do consentimento | Mudar flag de consentimento e parar o tratamento correspondente (ex.: sair de listas de marketing) |
| Revisão de decisão automatizada (art. 20) | Se houver decisão automatizada relevante (ex.: score de crédito), permitir revisão |

Prazos de resposta (art. 19): confirmação ou acesso em formato simplificado, imediatamente; declaração completa em até 15 dias do requerimento.

### Exportação por titular

```ts
export async function exportarDadosCliente(tenantId: string, clienteId: string) {
  const cliente = await prisma.cliente.findFirst({
    where: { tenantId, id: clienteId },
    select: {
      nome: true, email: true, telefone: true, cpf: true, criadoEm: true,
      consentimentos: { select: { finalidade: true, concedidoEm: true, revogadoEm: true, versaoTexto: true } },
      vendas: { select: { id: true, criadaEm: true, totalCentavos: true, itens: { select: { descricao: true, quantidade: true } } } },
    },
  });
  if (!cliente) throw new ClienteNaoEncontradoError(clienteId);
  await registrarAuditoria({ tenantId, acao: 'EXPORTACAO_TITULAR', alvoId: clienteId });
  return cliente; // servido como download autenticado, nunca por link público permanente
}
```

### Exclusão versus anonimização

- Registros com obrigação legal de guarda (vendas, notas fiscais) não são apagados; os dados pessoais neles são anonimizados quando a guarda não exige identificação, ou mantidos só pelo prazo legal.
- Anonimize de forma irreversível: substituir por valor fixo ou nulo, não por hash do valor original.
- Remova também de caches, índices de busca, filas pendentes, storage de arquivos e ferramentas terceiras (CRM, e-mail marketing).
- Backups: dados excluídos permanecem até a expiração do backup. Documente a janela e, em caso de restore, reaplique as exclusões registradas (lista de titulares anonimizados).
- Toda operação de exclusão/anonimização gera registro de auditoria (quem pediu, quando, o que foi feito), sem copiar o dado apagado para o log.

## Retenção

| Dado | Retenção típica (confirmar com jurídico/contador) | Mecanismo |
|---|---|---|
| Documentos fiscais e dados neles | prazo legal tributário (em geral 5 anos, conforme a regra aplicável) | manter, com acesso restrito |
| Cliente sem compras há muito tempo | definido pela política da loja | job de anonimização |
| Logs de aplicação | curto (ex.: 30 a 90 dias) | retenção na plataforma de logs |
| Logs de acesso a dados pessoais (auditoria) | mais longo, definido em política | tabela ou storage imutável |
| Payloads de webhooks recebidos | curto após processamento | job de limpeza |
| Tokens de reset de senha, sessões | expiração curta | TTL e limpeza |
| Contas canceladas (usuários do SaaS) | prazo contratual + obrigações | anonimização após o prazo |

Implementação:
- Coluna de data de referência (`ultimaCompraEm`, `canceladoEm`) indexada.
- Job periódico idempotente, em lotes, com métrica de itens processados e alerta de falha.

## Segurança proporcional ao risco

- Criptografia em trânsito (TLS em tudo, inclusive banco) e em repouso (disco do provedor).
- Colunas especialmente sensíveis (documento, dados de saúde, se existirem): criptografia no nível de aplicação ou `pgcrypto`, com chave fora do banco. Ver `banco-seguranca-operacao`.
- Nunca armazenar número completo de cartão: tokenização pelo gateway.
- Mascaramento na UI e em relatórios (`***.456.789-**`) para perfis que não precisam do dado completo.
- Acesso por papel; exportações em massa de clientes restritas a administradores e auditadas.
- Dados pessoais fora de URLs, query strings, nomes de arquivos, títulos de página, eventos de analytics e mensagens de erro.
- Ambientes não produtivos só com dados sintéticos ou anonimizados.

## Terceiros e transferência internacional

- Mantenha a lista de operadores que recebem dados pessoais (hospedagem, e-mail, WhatsApp, APM, analytics, gateway, emissor fiscal) com finalidade e dados enviados.
- Ferramentas hospedadas fora do Brasil caracterizam transferência internacional (art. 33): precisa de mecanismo válido; decida com o jurídico.
- Envie o mínimo a cada terceiro (ex.: APM sem PII, analytics com ID pseudônimo).

## Incidentes de segurança

Fluxo:
1. Detectar e conter (revogar credenciais, fechar acesso, preservar evidências e logs).
2. Avaliar: quais dados, quantos titulares, quais tenants, desde quando, se há risco ou dano relevante.
3. Comunicar: se houver risco ou dano relevante aos titulares, comunicar à ANPD e aos titulares. A Resolução CD/ANPD nº 15/2024 estabelece prazo de 3 dias úteis a partir do conhecimento de que o incidente afetou dados pessoais, com possibilidade de complementação posterior.
4. Como operador, avisar imediatamente as lojas (controladoras) afetadas, conforme contrato, para que cumpram suas obrigações.
5. Registrar o incidente (mesmo os não comunicados), com fatos, avaliação, medidas e decisão. Mantenha o registro pelo prazo previsto no regulamento (mínimo de 5 anos).
6. Pós-incidente: causa raiz, correções, reteste, atualização do runbook.

Preparação técnica que viabiliza o prazo:
- Logs de acesso e auditoria que permitem dizer quais registros foram acessados.
- Inventário de onde cada dado pessoal está.
- Contatos das lojas e do encarregado atualizados; modelos de comunicação prontos.

Sanções (art. 52) incluem advertência, multa de até 2% do faturamento limitada a R$ 50 milhões por infração, publicização e bloqueio ou eliminação dos dados.

## Privacy by design: checklist por feature

Antes de implementar uma feature que toca dado pessoal, a spec ou o relatório responde:

- [ ] Quais dados pessoais novos são coletados e por quê (finalidade)?
- [ ] Qual a base legal? Se consentimento, onde é coletado e guardado?
- [ ] Algum dado é sensível (art. 5º, II)? Dá para evitar?
- [ ] Qual o prazo de retenção e qual job o aplica?
- [ ] O dado aparece em logs, métricas, analytics, URLs ou mensagens de erro? (não deveria)
- [ ] Quem pode ver (papéis) e o acesso fica auditado?
- [ ] O dado está incluído na exportação e na anonimização por titular?
- [ ] Algum terceiro recebe o dado? Está na lista de operadores?
- [ ] O padrão é o mais restritivo (opt-in para marketing, campos opcionais de fato opcionais)?

## Marcação no schema

Documente campos pessoais no próprio schema para facilitar inventário e revisão:

```prisma
model Cliente {
  id           String    @id @default(uuid())
  tenantId     String
  /// PII: nome do titular. Base: execução de contrato. Retenção: política da loja.
  nome         String
  /// PII: contato. Base: execução de contrato; marketing só com consentimento.
  telefone     String?
  /// PII: documento. Base: obrigação legal (fiscal), quando exigido.
  cpf          String?
  anonimizadoEm DateTime? @db.Timestamptz(6)
  ultimaCompraEm DateTime? @db.Timestamptz(6)

  @@index([tenantId, ultimaCompraEm])
}
```
