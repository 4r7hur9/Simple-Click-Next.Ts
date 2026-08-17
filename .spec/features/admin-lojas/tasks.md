# Tasks: Administração de Lojas

> feature: admin-lojas

## T-200 — Cadastro de loja com código sequencial e convite do dono [pendente]

- Refs: US-200, AC-200, AC-201, AC-202
- Arquivos: apps/api/src/modules/admin/criar-loja.usecase.ts, apps/api/src/modules/admin/criar-loja.usecase.test.ts, apps/api/src/modules/admin/admin.schema.ts, apps/api/src/modules/admin/documento.ts, apps/api/src/modules/admin/documento.test.ts, apps/web/src/app/(admin)/admin/lojas/nova/page.tsx, packages/contracts/src/admin.ts
- Notas: apelido único conferido antes de gravar, com sugestão de variação livre. CPF e CNPJ validados por dígito verificador. Código sequencial de quatro dígitos herdado do primeiro SimpleClick.
- Esforço: alto

## T-201 — Lista e busca de lojas [pendente]

- Refs: US-202, AC-206
- Arquivos: apps/api/src/modules/admin/listar-lojas.usecase.ts, apps/api/src/modules/admin/listar-lojas.usecase.test.ts, apps/web/src/app/(admin)/admin/lojas/page.tsx, apps/web/src/features/admin/ListaLojas.tsx
- Notas: busca por parte do nome, do documento e do código. Estados de carregando, vazio e erro tratados.
- Esforço: medio

## T-202 — Ficha da loja, edição e auditoria de alteração [pendente]

- Refs: US-202, AC-207
- Arquivos: apps/api/src/modules/admin/editar-loja.usecase.ts, apps/api/src/modules/admin/editar-loja.usecase.test.ts, apps/web/src/app/(admin)/admin/lojas/[id]/page.tsx, apps/web/src/features/admin/FichaLoja.tsx
- Notas: histórico registra quem alterou, quando e quais campos mudaram, com valor anterior.
- Esforço: medio

## T-203 — Alteração do tipo de negócio pela administração [pendente]

- Refs: US-202, AC-214, AC-323
- Arquivos: apps/api/src/modules/admin/alterar-vertical.usecase.ts, apps/api/src/modules/admin/alterar-vertical.usecase.test.ts, apps/api/tests/vertical-somente-admin.test.ts, apps/web/src/features/admin/SeletorVertical.tsx
- Notas: escrita nessa coluna é exclusiva da credencial de administração. Nenhum produto ou categoria perde dado; o controle de estoque do ramo novo é ativado; a alteração é auditada. Teste prova que o dono é recusado mesmo chamando a API direto.
- Esforço: alto

## T-204 — Apelido alterado preserva o endereço antigo [pendente]

- Refs: US-202, AC-208
- Arquivos: apps/api/src/modules/admin/alterar-apelido.usecase.ts, apps/api/src/modules/admin/alterar-apelido.usecase.test.ts, apps/web/src/proxy.ts
- Notas: endereço antigo redireciona para o novo, para não quebrar link já compartilhado com clientes.
- Esforço: medio

## T-205 — Contrato e documentos com link temporário [pendente]

- Refs: US-201, AC-203, AC-204, AC-205
- Arquivos: apps/api/src/modules/files/assinar-upload.usecase.ts, apps/api/src/modules/files/assinar-upload.usecase.test.ts, apps/api/src/modules/files/tipo-de-arquivo.ts, apps/api/src/modules/files/tipo-de-arquivo.test.ts, apps/api/src/modules/admin/contratos.usecase.ts, apps/web/src/app/(admin)/admin/lojas/[id]/documentos/page.tsx
- Notas: o tipo é conferido pelos bytes do arquivo, nunca pela extensão. Arquivo nunca fica público; o acesso é por link temporário gerado no clique, com prazo curto.
- Esforço: alto

## T-206 — Suspender, reativar e excluir com retenção [pendente]

- Refs: US-203, AC-209, AC-210, AC-211
- Arquivos: apps/api/src/modules/admin/status-loja.usecase.ts, apps/api/src/modules/admin/status-loja.usecase.test.ts, apps/web/src/features/admin/AcoesLoja.tsx, apps/web/src/app/(loja)/l/[slug]/indisponivel/page.tsx
- Notas: suspensão tira do ar sem apagar nada. Exclusão exige confirmação digitando o nome e mantém retenção pelo prazo definido antes da remoção definitiva.
- Esforço: medio

## T-207 — Funcionalidades liberadas por loja [pendente]

- Refs: US-204, AC-212, AC-213
- Arquivos: apps/api/src/modules/admin/features.usecase.ts, apps/api/src/modules/admin/features.usecase.test.ts, apps/api/src/core/features.ts, apps/web/src/app/(admin)/admin/lojas/[id]/funcionalidades/page.tsx
- Notas: funcionalidade desligada não aparece no menu do dono e a rota correspondente responde indisponível mesmo acessada direto. Na versão 1 tudo nasce ligado, sem cobrança e sem limite, e nenhuma tela pede pagamento.
- Esforço: medio

## T-208 — Histórico de auditoria consultável [pendente]

- Refs: US-202, AC-118, AC-922
- Arquivos: apps/api/src/modules/admin/auditoria.usecase.ts, apps/api/src/modules/admin/auditoria.usecase.test.ts, apps/web/src/app/(admin)/admin/auditoria/page.tsx
- Notas: trilha que não pode ser alterada nem apagada. Alterações sensíveis, como a chave PIX, aparecem destacadas.
- Esforço: medio

## T-209 — Telas de ponta a ponta da administração [pendente]

- Refs: US-200, US-203, AC-200, AC-209
- Arquivos: e2e/specs/admin-lojas.spec.ts, e2e/specs/admin-documentos.spec.ts
- Notas: cobre criar loja, alterar tipo de negócio, suspender e reativar, e o upload de contrato com arquivo de tipo disfarçado.
- Esforço: medio
