---
name: devops-observabilidade-lgpd
description: "Operação em produção e privacidade: ambientes separados, CI/CD com gates, containers mínimos e não root, IAM mínimo, segredos, deploy com migrations seguras, DR com RPO/RTO, WAF e TLS, logs JSON com correlation ID e sem PII, métricas RED/USE e de negócio, tracing OpenTelemetry, Sentry, health checks, graceful shutdown, alertas acionáveis e LGPD (minimização, base legal, direitos do titular, retenção, incidentes à ANPD). Use quando a task mexe em pipeline, Dockerfile, deploy, variáveis de ambiente, logs, métricas, alertas, health check, ou coleta, guarda, exporta ou apaga dado pessoal. Não use para convenções de Git (use stack-e-convencoes) nem para privilégios e backup do banco (use banco-seguranca-operacao)."
---

# DevOps, observabilidade e LGPD

Garante que o que foi construído chega em produção de forma segura, é observável quando quebra e trata dados pessoais conforme a LGPD.
`implementer` e `fixer` seguem as regras ao mexer em infra, logs e dados pessoais; no Workflow IA, mudança em `.github/workflows/`, `.husky/` ou `.workflow-ia/config.json` é decisão humana (os hooks bloqueiam): registre em `decisoes.md` e encerre como BLOQUEADA. O `ops-reviewer` (categoria `operacao/`) usa o checklist; o item 1 (segredos) é revisado pelo `security-reviewer` como `seguranca/segredos`. A severidade final segue a rubrica de `triagem-findings`. Exemplos com GitHub Actions, Docker, Railway/Vercel, pino, OpenTelemetry e Sentry; em outro stack, aplique o equivalente.

## Regras inegociáveis

1. **Ambientes dev, staging e produção separados, com credenciais, bancos e chaves próprios.** Credencial compartilhada transforma um vazamento de dev em incidente de produção.
2. **Segredos só no gerenciador de segredos ou variáveis da plataforma; nunca no repositório, na imagem, em build args, em logs ou com prefixo `NEXT_PUBLIC_`.** Segredo exposto exige rotação imediata e pode ser explorado em minutos.
3. **Dados de produção nunca vão para dev/staging sem anonimização.** Cópia de produção em ambiente frouxo é incidente de dados pessoais.
4. **Gates do CI (typecheck, lint, testes, audit de dependências, secret scan) são obrigatórios e nunca são pulados ou afrouxados.** Pipeline que deixa passar vermelho não protege nada.
5. **Container com imagem mínima, multi-stage, usuário não root e scan de vulnerabilidades.** Imagem gorda e root ampliam o estrago de qualquer RCE.
6. **Logs estruturados em JSON, com correlation ID, nível adequado e redaction de senha, token, cookie, cartão e documentos pessoais.** Log com PII é vazamento; log sem correlação é inútil no incidente.
7. **Todo serviço expõe liveness e readiness e faz graceful shutdown em `SIGTERM`.** Sem isso, deploy derruba requisições e o orquestrador mata instância saudável.
8. **Erros de front e back reportados ao Sentry (ou equivalente) com source maps enviados de forma privada e envio de PII desligado por padrão.** Source map público expõe o código; PII no APM é vazamento.
9. **Alerta só sobre sintoma acionável (taxa de erro, latência p95/p99, fila parada, SLO), com dono e runbook.** Alerta barulhento é ignorado e o incidente real passa.
10. **Migrations em deploy são compatíveis com a versão anterior do código (expand/contract) e rodam como passo separado antes da troca de versão.** Migration destrutiva junto com deploy quebra instâncias antigas e impede rollback.
11. **Backups automáticos com RPO/RTO definidos e restore testado periodicamente.** Backup nunca restaurado é hipótese, não backup.
12. **Menor privilégio em IAM, tokens de deploy e integrações do CI.** Token amplo no CI é a porta mais fácil para supply chain.
13. **Todo dado pessoal novo tem finalidade, base legal, retenção e local de armazenamento definidos; colete só o necessário.** Dado sem finalidade é passivo jurídico e superfície de vazamento.
14. **Direitos do titular são implementáveis: acesso, correção, portabilidade e exclusão ou anonimização por titular, respeitando retenções legais.** Pedido de titular sem caminho técnico vira descumprimento da LGPD.
15. **Incidente com dado pessoal segue o plano de resposta, incluindo avaliação e comunicação à ANPD e aos titulares no prazo regulamentar.** Atraso na comunicação agrava a sanção.

## Como construir

### Ambientes e deploy
- Vercel: variáveis separadas por Production, Preview e Development; Preview nunca aponta para o banco de produção.
- Railway: um environment por estágio, com serviços e variáveis próprios; health check configurado no serviço.
- Deploy: build imutável, promovido entre ambientes; migrations antes da troca de versão; rollback documentado.
- WAF e proteção DDoS na borda (ex.: Cloudflare), TLS automático, HSTS; TLS também até o banco.
- Alertas de billing em todas as contas de nuvem.
- Detalhes, workflow de CI e Dockerfile: [references/ci-cd-containers.md](references/ci-cd-containers.md).

### Logs
- Um logger (pino ou o do projeto), JSON em produção, `level` por env.
- Cada log de request carrega `requestId`, `tenantId`, `userId` (ID, não e-mail), rota, status e duração.
- `requestId` vem do header `x-request-id` validado ou é gerado, propagado para chamadas externas e filas, e devolvido na resposta.
- Redaction configurada no logger, não confiada à disciplina de cada chamada.
- `error` para falha que exige ação; `warn` para anomalia tolerada; `info` para eventos de negócio relevantes; `debug` desligado em produção.

### Métricas, tracing e erros
- RED por rota (Rate, Errors, Duration com p50/p95/p99) e USE por recurso (CPU, memória, pool de conexões, fila).
- Métricas de negócio: vendas por minuto, falhas de pagamento, fila de NFC-e pendente, webhooks com falha.
- Labels de baixa cardinalidade: rota como template (`/vendas/:id`), nunca URL crua ou ID.
- Tracing com OpenTelemetry (em Next.js, `instrumentation.ts`); propagação de contexto em HTTP e filas.
- Sentry em front e back, `sendDefaultPii: false`, `release` e `environment` definidos, source maps enviados no build e não publicados.
- Detalhes e código: [references/observabilidade.md](references/observabilidade.md).

### Saúde e ciclo de vida
- `GET /healthz` (liveness): processo vivo, sem dependências.
- `GET /readyz` (readiness): banco (`SELECT 1`), Redis e dependências essenciais, com timeout curto.
- `SIGTERM`: parar de aceitar requisições, terminar as em andamento, fechar workers, `prisma.$disconnect()`, sair.
- Uptime externo sobre a rota pública principal.

### LGPD
- Mapeie cada dado pessoal novo: categoria, finalidade, base legal, retenção, onde fica, quem acessa, com quem é compartilhado.
- Dados sensíveis (saúde, biometria, etc.) exigem base legal específica; evite coletar.
- CPF, telefone e e-mail do cliente da loja: só se a funcionalidade precisa; mascare na UI e nos logs.
- Implemente exportação (JSON legível), correção, exclusão ou anonimização por titular, com trilha de auditoria.
- Retenção por tabela com job de limpeza; documentos fiscais seguem o prazo legal aplicável.
- Privacy by design: padrão mais restritivo, acesso por papel, dados pessoais fora de URLs, analytics sem PII.
- Detalhes, bases legais, prazos e fluxos: [references/lgpd.md](references/lgpd.md).

## Checklist de revisão

| # | Verificação | Severidade padrão |
|---|---|---|
| 1 | Segredo em código, Dockerfile, build arg, workflow, log ou variável `NEXT_PUBLIC_` (revisado pelo security-reviewer) | `urgente` |
| 2 | Gate do CI removido, marcado como `continue-on-error` ou condicionado para não rodar | `urgente` |
| 3 | Ambiente não produtivo configurado com banco ou credencial de produção | `urgente` |
| 4 | Dump ou cópia de produção para dev/staging sem anonimização | `urgente` |
| 5 | Log com senha, token, cookie, número de cartão ou CPF completo (`urgente`); corpo de requisição com outra PII (`alto`); só e-mail do cliente (`medio`) | `urgente` |
| 6 | Migration destrutiva (drop/rename/NOT NULL sem default) no mesmo deploy que muda o código | `urgente` |
| 7 | Container rodando como root ou imagem de build completa em produção | `alto` |
| 8 | Serviço sem readiness/liveness ou sem tratamento de `SIGTERM` | `alto` |
| 9 | Source maps publicados no bundle público | `alto` |
| 10 | Sentry/APM com `sendDefaultPii: true` ou enviando corpo de request com dados pessoais | `alto` |
| 11 | Novo dado pessoal coletado sem finalidade e base legal registradas | `alto` |
| 12 | Nova tabela ou campo com dado pessoal sem caminho de exclusão/anonimização por titular | `alto` |
| 13 | Token de CI/deploy ou papel IAM com permissões além do necessário | `alto` |
| 14 | Action de terceiro no CI sem versão fixada (tag mutável em ação não oficial) | `medio` |
| 15 | Log sem `requestId` ou sem formato estruturado em código novo | `medio` |
| 16 | Erro capturado e não reportado nem logado | `medio` |
| 17 | Métrica com label de alta cardinalidade (ID, URL crua, e-mail) | `medio` |
| 18 | Integração ou fila nova sem métrica de falha e sem alerta | `medio` |
| 19 | Alerta sem runbook, sem dono ou sobre causa em vez de sintoma | `medio` |
| 20 | Dado pessoal sem prazo de retenção nem job de limpeza | `medio` |
| 21 | Dado pessoal em URL, query string ou nome de arquivo | `medio` |
| 22 | Variável de ambiente nova sem validação no boot e sem cadastro por ambiente | `medio` |
| 23 | `console.log` em vez do logger do projeto em código de servidor | `baixo` |
| 24 | Nível de log inadequado (`error` para fluxo normal, `info` para ruído) | `baixo` |
| 25 | Dockerfile sem `.dockerignore` ou com cache de camadas mal ordenado | `baixo` |

## Anti-padrões (errado → certo)

**Log com dados pessoais e sem contexto**
```ts
// errado
console.log('login', { email, senha, body: req.body });

// certo: logger estruturado com redaction e IDs
logger.info({ requestId, tenantId, userId: usuario.id, evento: 'login_sucesso' }, 'login');
```

**Segredo exposto ao cliente**
```ts
// errado: vai para o bundle do navegador
const chave = process.env.NEXT_PUBLIC_GATEWAY_SECRET;

// certo: só no servidor, via módulo de env
import 'server-only';
import { env } from '@/lib/env';
const chave = env.GATEWAY_SECRET;
```

**Health check que mente**
```ts
// errado: sempre 200, mesmo sem banco
export async function GET() { return Response.json({ ok: true }); }

// certo: readiness verifica dependência com timeout curto
export async function GET() {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 1000)),
    ]);
    return Response.json({ status: 'ok' });
  } catch {
    return Response.json({ status: 'indisponivel' }, { status: 503 });
  }
}
```

**Exclusão de titular que apaga o que a lei manda guardar**
```ts
// errado: apaga cliente e, em cascata, vendas e documentos fiscais
await prisma.cliente.delete({ where: { id } });

// certo: anonimiza dados pessoais e preserva registros com obrigação legal
await prisma.cliente.updateMany({
  where: { tenantId, id },
  data: { nome: 'Titular anonimizado', email: null, telefone: null, cpf: null, anonimizadoEm: new Date() },
});
```

**Gate afrouxado no CI**
```ts
// errado (workflow YAML):   - run: pnpm test
//                             continue-on-error: true
// certo:                     - run: pnpm test      (falhou, o pipeline para)
```

## Referências

- [references/ci-cd-containers.md](references/ci-cd-containers.md): leia ao alterar workflow de CI, Dockerfile, deploy em Railway/Vercel, estratégia de migrations em produção, ambientes, segredos, IAM ou DR.
- [references/observabilidade.md](references/observabilidade.md): leia ao adicionar logs, correlation ID, métricas, tracing, Sentry, health checks, graceful shutdown ou alertas.
- [references/lgpd.md](references/lgpd.md): leia sempre que a task coletar, armazenar, exibir, exportar, compartilhar ou apagar dado pessoal, ou tratar incidente de segurança.
