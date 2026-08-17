# Pendências

Dívidas conhecidas e o que retomar. Uma linha sai daqui quando deixa de valer.

## Para retomar (17/08/2026)

### Onde paramos

Fase **F0 (fundação)**: 6 de 20 tarefas concluídas, 163 testes passando,
14 de 253 critérios de aceite provados. Tudo enviado para `main`.

| Concluída | O que entregou                                                          |
| --------- | ----------------------------------------------------------------------- |
| T-001     | Monorepo, ferramentas, fronteiras entre camadas verificadas pelo ESLint |
| T-002     | Docker Compose com Traefik, `app.localhost` e `api.localhost` com TLS   |
| T-003     | Variáveis de ambiente validadas na partida, verificador de ambientes    |
| T-004     | Migrações, três credenciais de banco, isolamento por linha provado      |
| T-016     | Design system com os quatro estados, contraste WCAG, regra de cor       |
| T-019     | Esqueleto do site (Next) e da API (Express)                             |

### Próximo passo

**Grupo C** — as três dependem das migrações da T-004, que já entrou:

- **T-005** — guardas estruturais do banco (G1 a G9) no portão de qualidade
- **T-006** — caminho único de acesso ao banco, com contexto por transação
- **T-007** — banco de teste separado e efêmero

Depois: grupo D (T-008 seed, T-009 construtores, T-010 prova de isolamento),
grupo E (T-011 a T-015), grupo F (T-020) e grupo G (T-017, T-018).

### Como subir o ambiente

```bash
bash infra/scripts/setup.sh   # cria infra/compose/.env.compose e o certificado
bash infra/scripts/up.sh      # sobe banco, cache, roteador, api e web
bash infra/scripts/verificar.sh  # o portão completo
```

## Dívidas abertas

1. ~~`infra/compose/.env.compose` não existe na raiz.~~ **Resolvido em
   17/08:** `setup.sh` gerou o arquivo, as senhas foram criadas com
   `openssl rand` e o banco de teste ficou na porta 5533 — a 5433 é do projeto
   `preco-menu-web` desta mesma máquina, e o choque derrubava a subida.

2. **`.env` da raiz foi montado à mão.** As senhas dos três papéis de banco
   foram escritas por mim, sincronizadas com o `.env.compose`. O `setup.sh`
   deveria gerar os dois de uma vez — entra na T-017, quando o portão for
   consolidado.

3. **`check-ambientes.sh` não está ligado ao portão.** Ele existe e é testado,
   mas sem `.env` configurado sairia com código 2 e reprovaria todo mundo.
   Ligar quando o `setup.sh` passar a criar o `.env`.

4. **Os dois projetos disputam a memória do Docker.** O ambiente do SimpleClick
   sobe 7 contêineres, e com o `preco-menu-web` no ar isso encheu os 8 GB
   disponíveis — os contêineres do outro projeto foram encerrados por pressão de
   memória em 17/08. Nenhum dado foi perdido (os bancos desligaram limpos e os
   volumes estão intactos), mas convém subir um projeto de cada vez, ou aumentar
   a memória do Docker Desktop.

5. **`vitest.config.ts` da raiz é declarado pela T-007.** Quem fizer a T-007
   precisa **estender** o arquivo existente, acrescentando os projetos
   (unit, api-int, web, db-rls) — e não recriá-lo. A opção de JSX que está lá é o
   que permite ler qualquer arquivo de componente do site.

6. **`.spec/verification/sinais.json` gera atrito em todo merge.** É derivado,
   regenerado a cada auditoria, e conflita sempre. Resolver aceitando qualquer
   lado e regenerando. Se incomodar de novo, avaliar deixá-lo fora do
   versionamento — o custo é perder o lastro histórico das lições.

7. **Traefik aparece como não saudável** embora roteie corretamente. A
   verificação de saúde dele precisa de ajuste; não impede o uso.

## Portão contornado

Nenhuma vez até agora. Quando acontecer (`LEFTHOOK=0 git push`), registre aqui a
data, o motivo e o que ficou sem verificação — é o que exige o critério AC-043.
