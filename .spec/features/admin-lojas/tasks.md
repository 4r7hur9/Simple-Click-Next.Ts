# Tasks: Administração de Lojas

> feature: admin-lojas

## T-200 — Cadastro de loja com código sequencial e convite do dono [concluida]

- Refs: US-200, AC-200, AC-201, AC-202
- Arquivos: apps/api/src/modules/admin/criar-loja.usecase.ts, apps/api/src/modules/admin/criar-loja.usecase.test.ts, apps/api/src/modules/admin/admin.schema.ts, apps/api/src/modules/admin/admin.routes.ts, apps/api/src/modules/admin/lojas.repo.ts, apps/api/src/modules/admin/convite-do-dono.ts, apps/api/tests/admin-cadastro.test.ts, apps/api/tests/apoio-da-administracao.ts, packages/contracts/src/admin.ts, packages/contracts/src/documento.ts, packages/contracts/src/documento.test.ts, packages/database/migrations/0032_administracao_de_lojas.sql, apps/web/src/app/(admin)/admin/lojas/nova/page.tsx, apps/web/src/app/api/admin/[...caminho]/route.ts, apps/web/src/features/admin/FormularioNovaLoja.tsx, apps/web/src/features/admin/formulario-da-loja.ts, apps/web/src/server/admin-api.ts, apps/web/tests/admin-nova-loja.test.tsx
- Notas: apelido único conferido antes de gravar, com sugestão de variação livre. CPF e CNPJ validados por dígito verificador (a regra mora no contrato, `documento.ts`, porque o formulário e a API aplicam a mesma). Código sequencial de quatro dígitos herdado do primeiro SimpleClick, emitido por função com trava (`app.proximo_codigo_de_loja`, migração 0032). O convite do dono grava a linha de `store_members` (loja, identidade, papel OWNER, quem convidou, resumo e prazo do token) — é dela que a correção da dívida 92 vai depender.
- Esforço: alto

## T-201 — Lista e busca de lojas [concluida]

- Refs: US-202, AC-206
- Arquivos: apps/api/src/modules/admin/listar-lojas.usecase.ts, apps/api/src/modules/admin/listar-lojas.usecase.test.ts, apps/api/src/modules/admin/lojas.repo.ts, apps/api/src/modules/admin/admin.routes.ts, apps/api/src/modules/admin/admin.schema.ts, apps/api/tests/admin-lista.test.ts, apps/web/src/app/(admin)/admin/lojas/page.tsx, apps/web/src/features/admin/ListaLojas.tsx, apps/web/tests/admin-lista-lojas.test.tsx, apps/web/src/lib/routes.ts, packages/contracts/src/admin.ts, packages/contracts/src/index.ts
- Notas: busca por parte do nome sem acento nem distinção de maiúsculas, dígitos do CPF/CNPJ com ou sem máscara e código de atendimento. A lista é paginada e filtra por situação; por padrão não mostra excluídas, mas a administração pode consultá-las durante a retenção. A consulta devolve o total mesmo se a página pedida ficar além da última, regressão provada contra PostgreSQL real. O contrato não expõe documento nem contato do responsável. A tela cobre carregamento, vazio, erro, sucesso e navegação até a ficha.
- Esforço: medio

## T-202 — Ficha da loja, edição e auditoria de alteração [concluida]

- Refs: US-202, AC-207
- Arquivos: apps/api/src/modules/admin/editar-loja.usecase.ts, apps/api/src/modules/admin/editar-loja.usecase.test.ts, apps/api/src/modules/admin/trilha.ts, apps/api/src/modules/admin/lojas.repo.ts, apps/api/src/modules/admin/admin.routes.ts, apps/api/src/modules/admin/admin.schema.ts, apps/api/tests/admin-ficha.test.ts, packages/contracts/src/admin.ts, packages/contracts/src/index.ts, apps/web/src/app/(admin)/admin/lojas/[id]/page.tsx, apps/web/src/features/admin/FichaLoja.tsx, apps/web/src/features/admin/ListaDaTrilha.tsx, apps/web/src/features/admin/edicao-da-loja.ts, apps/web/src/features/admin/trilha-na-tela.ts, apps/web/src/lib/routes.ts, apps/web/tests/admin-ficha-loja.test.tsx
- Notas: histórico registra quem alterou, quando e quais campos mudaram, com valor anterior. A ficha (`GET /v1/admin/lojas/:id`) mostra o cadastro inteiro — documento e contato inclusive, só pela credencial `sc_admin` — e as últimas 20 alterações da loja; cada abertura grava `ADMIN_ACCESS` na mesma transação da leitura (AC-118: quem, o quê e quando, sem o dado aberto). A edição (`PATCH`) recebe só o que mudou, validado pelo contrato (`esquemaDaEdicaoDaLoja`, o mesmo do formulário): apelido, tipo de negócio e situação ficam de fora porque têm endereço próprio. Lê o cadastro com trava de linha, grava e registra `LOJA_ALTERADA` numa transação só; salvar sem mudança não vira linha. Documento, e-mail, telefone, CEP, logradouro, número e complemento entram MASCARADOS na trilha (P-009, a mesma regra do final à mostra da configuração do dono). A leitura da trilha (`trilha.ts`) aceita os dois formatos gravados — `{ campos }` da configuração e das edições, e o objeto direto do cadastro — e a ordem dos campos é a do `jsonb`, não a de gravação. A tela manda só os campos alterados (cadastro antigo sem e-mail não trava a correção do nome) e recusa o documento inválido antes de enviar.
- Esforço: medio

## T-203 — Alteração do tipo de negócio pela administração [concluida]

- Refs: US-202, AC-214, AC-323
- Arquivos: apps/api/src/modules/admin/alterar-vertical.usecase.ts, apps/api/src/modules/admin/alterar-vertical.usecase.test.ts, apps/api/src/modules/admin/lojas.repo.ts, apps/api/src/modules/admin/admin.routes.ts, apps/api/src/modules/admin/admin.schema.ts, apps/api/tests/admin-tipo-de-negocio.test.ts, apps/api/tests/apoio-da-administracao.ts, apps/api/tests/vertical-somente-admin.test.ts, packages/contracts/src/admin.ts, packages/contracts/src/index.ts, apps/web/src/features/admin/SeletorVertical.tsx, apps/web/src/features/admin/FichaLoja.tsx, apps/web/src/server/admin-api.ts, apps/web/tests/admin-tipo-de-negocio.test.tsx, apps/web/tests/admin-ficha-loja.test.tsx
- Notas: escrita nessa coluna é exclusiva da credencial de administração. Nenhum produto ou categoria perde dado; o controle de estoque do ramo novo é ativado; a alteração é auditada. Teste prova que o dono é recusado mesmo chamando a API direto. O lado do DONO já está provado (AC-323, `vertical-somente-admin.test.ts`, referenciado e não duplicado): o tipo de negócio mandado dentro de uma seção é recusado com 400 `campo_da_plataforma`, e o endereço `configuracao/tipo-de-negocio` continua sem rota (404, AC-921). O lado da administração (AC-214): `PUT /v1/admin/lojas/:id/tipo-de-negocio` trava a linha da loja, troca `vertical_code` e `vertical_schema_version`, sobe `catalog_version` e registra `TIPO_DE_NEGOCIO_ALTERADO` (de qual tipo para qual, e o controle de estoque de cada um) numa transação só; pedir o tipo atual não grava nem registra. Produto, categoria, grupo, variação e preço NÃO são tocados — o produto guarda o ramo com que nasceu —, o que a prova mede pelo retrato inteiro das tabelas do catálogo antes e depois. O controle de estoque segue o ramo da loja (a grade do painel pergunta `tracks_stock`), então liga na hora; o saldo das variações existentes NÃO é inventado — continua "sem contagem" até o dono informar, porque nascer com zero esgotaria o catálogo inteiro. A recusa do dono é provada pela rota da administração (403 com a frase da plataforma) e pela coluna no banco (42501 pela credencial das lojas). Na ficha, `SeletorVertical` troca em dois passos, com a confirmação dizendo o que muda e o que não muda, sem `window.confirm`. A mesma troca prova o AC-320 do catálogo (T-309, `apps/api/tests/tipo-de-negocio-preserva-catalogo.int.test.ts`).
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
