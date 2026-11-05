# Exemplos de calibração de severidade

| # | Achado | Severidade | Por quê |
|---|---|---|---|
| 1 | `findUnique({ where: { id } })` em rota autenticada, sem filtro de tenant | urgente | IDOR explorável trocando o id na URL |
| 2 | `prisma.user.update({ data: req.body })` | urgente | Mass assignment: atacante envia `role: "admin"` |
| 3 | Chave de API do gateway em `NEXT_PUBLIC_GATEWAY_KEY` | urgente | Segredo entregue no bundle do navegador |
| 4 | Total do pedido vindo do cliente e gravado sem recálculo | urgente | Fraude trivial de preço (falha de lógica de negócio) |
| 5 | Venda e baixa de estoque em duas chamadas sem transação | urgente | Falha no meio deixa estoque inconsistente (corrupção de dados) |
| 6 | CA-4 descrito no spec, sem código que o implemente | urgente | Critério de aceite não atendido |
| 7 | `dangerouslySetInnerHTML` com descrição de produto digitada pelo lojista, sem sanitizar | urgente | XSS armazenado |
| 8 | `logger.info({ body: req.body })` no checkout, com CPF e cartão do cliente | urgente | `operacao/pii-log`: dado pessoal e financeiro vazado para o log de produção |
| 9 | Migration renomeia `clientes.telefone` para `celular` no mesmo deploy do código novo | urgente | `operacao/migration-deploy`: a versão ainda no ar quebra durante o deploy (falta expand/contract) |
| 10 | Loop `for (const p of pedidos) await prisma.item.findMany({ where: { pedidoId: p.id } })` na listagem principal | alto | N+1 em rota quente |
| 11 | Endpoint de login sem rate limit | alto | Força bruta viável; impacto provável |
| 12 | Dois caixas podem vender a última unidade (sem lock nem `version`) | alto | Race condition com impacto real em PDV |
| 13 | `GET /api/produtos` sem paginação, tabela com milhares de linhas | alto | Degrada com o crescimento; resposta pesada |
| 14 | CA-2 implementado, mas sem teste com `[CA-2]` | alto | Critério sem prova; regressão invisível |
| 15 | `fetch` para a API da transportadora sem timeout | alto | Uma dependência lenta prende os requests |
| 16 | Teste teve o `expect` trocado de `toBe(422)` para `toBeDefined()` na correção | alto | Teste enfraquecido para passar |
| 17 | Webhook de pagamento novo sem log estruturado com `requestId` nem métrica de falha | alto | `operacao/observabilidade`: falha em fluxo financeiro sem como rastrear nem alertar |
| 18 | Falta índice em `produto.categoriaId`, tabela com ~200 linhas | medio | Problema real, impacto pequeno hoje |
| 19 | Tela de listagem sem estado "vazio" | medio | UX incompleta, sem risco |
| 20 | `catch (e) { console.log(e) }` em fluxo secundário de exportação | medio | Erro engolido em caminho raro |
| 21 | Import de `lodash` inteiro para usar `debounce` | medio | Bundle maior sem necessidade |
| 22 | `process.env.FRETE_API_URL` lida no meio do código, sem validação no boot nem entrada no `.env.example` | medio | `operacao/config-env`: falha só aparece em produção, na primeira chamada |
| 23 | Variável `d` para "desconto" | baixo | Legibilidade |
| 24 | Comentário explicando "o quê" em vez de "porquê" | baixo | Estilo |

## Casos de fronteira

- **Stack trace exposto em produção:** alto. Vira urgente se revelar segredos, string de conexão ou caminhos internos sensíveis.
- **CORS `*` sem credenciais em API pública somente leitura:** baixo. Com credenciais, ou em API autenticada: alto.
- **Log com e-mail do cliente:** medio. Com CPF, cartão ou token: urgente.
- **Dependência com CVE:** siga a severidade do CVE quando o caminho vulnerável é usado pelo projeto; senão, medio.
- **Migration adicionando coluna NOT NULL sem default em tabela grande:** alto, porque trava ou falha em produção.
- **Teste E2E instável (flaky):** alto, porque destrói a confiança no gate. Não "corrija" com retry: ache a causa.
