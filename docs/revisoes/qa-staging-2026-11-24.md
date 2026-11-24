# QA do staging — 2026-11-24

Varredura no staging público (`https://staging.simplclick.com.br`, API `https://api.staging.simplclick.com.br`), só leitura: nada foi corrigido. Playwright/Chromium, sessão limpa, larguras 1440/1024/768/390 px, tema claro e escuro (`prefers-color-scheme`). Prints em `.rmcode/capturas/7/`. `/admin` e `/painel` ficaram de fora (outros cards).

Conta de teste criada: `qa-20261124@clientes.apresentacao.test` (senha gerada na hora, não registrada aqui).

## Os 5 piores

1. **S1 — Staging sem nenhuma loja:** as três lojas de demonstração dão 404 e `/explorar` está vazio. Não dá para mostrar o fluxo de compra.
2. **S2 — O tutorial do cliente volta a cada visita:** o `POST /api/conta/tutorial` responde 403 e "Pular" nunca é gravado.
3. **S3 — Todas as páginas dão erro 401 no console:** é o `GET /api/conta/aceites` chamado por quem não está logado.
4. **S4 — A área da conta mostra só estados vazios:** endereços, favoritos e pedidos aparecem em branco, sem dados para a demo.
5. **S5 — E-mails de suporte e privacidade com domínio diferente do site:** os links usam `@simpleclick.com.br`, o staging é `simplclick.com.br`.

## Resumo do que foi coberto

| Área | Resultado |
|---|---|
| `/` landing (7 cenas, âncoras, rodapé, links externos) | Sem quebra visual em 1440/390. Imagens ok, sem rolagem horizontal, todas as âncoras existem. Links externos ok (1 não abriu, ver item 12). |
| `/explorar`, `/vender`, `/entrar`, `/cadastrar`, `/cookies` | Carregam (200), sem rolagem horizontal nas 4 larguras e nos 2 temas. |
| `/termos-de-uso`, `/politica-de-privacidade`, `/lgpd`, `/cookies` | Ok (200). `/termos` e `/privacidade` (sem o sufixo) dão 404, mas os links do site apontam para as URLs certas. |
| 404 de rota inexistente | Ok: "Página não encontrada" com botão "Voltar para o início". |
| `/loja/*` | As 3 lojas dão 404 ("Esta loja não está disponível"). Ver item 1. |
| Cadastro de cliente | Funciona. Validação vazia e senha curta mostram mensagens claras. Cadastro leva ~2,5 s e cai em `/explorar/produtos`. |
| Conta (dados, endereços, favoritos, pedidos) | Abre nas 4 larguras e nos 2 temas. Tudo vazio (item 4). Não testei salvar endereço nem editar dados. |
| Sacola até o WhatsApp | **Não testável**: nenhuma loja ativa (item 1). |

## Problemas

Severidade: **Bloqueia** = bloqueia a apresentação, **Feio** = visível, mas não impede, **Menor** = detalhe.

| # | Sev. | Página | Largura | O que acontece | Print | Hipótese de causa / arquivo provável |
|---|---|---|---|---|---|---|
| 1 | Bloqueia | `/loja/brasa-burger`, `/loja/moto-pecas-fortal`, `/loja/pastelaria-da-vila`, `/explorar` | todas | As 3 lojas respondem 404 ("O endereço que você abriu não corresponde a nenhuma loja ativa"). `/explorar` mostra "As lojas ainda não apareceram por aqui", "As lojas ainda não publicaram produtos" e "Nenhum produto no feed ainda". Sem loja ativa não dá para ver vitrine, sacola nem tela do WhatsApp. | 02, 03, 04 | Faltam lojas ativas no banco do staging: as lojas existem aguardando aprovação ou nem foram criadas. É o escopo do card #4 (dados de apresentação); confirmar se o script já rodou e se as lojas foram aprovadas. A página de 404 vem de `apps/web/src/app/(loja)/loja/[slug]/not-found.tsx`. |
| 2 | Bloqueia | todas as telas do cliente logado (ex.: `/explorar`) | todas | O tutorial "Que bom ter você aqui" (1 DE 6) abre em toda visita, mesmo depois de "Pular". Por baixo: `POST /api/conta/tutorial` → **403** `{"erro":"origem_nao_autorizada","motivo":"fora_da_lista"}`. Em todo carregamento aparece também um erro 403 no console. | 01 | A verificação de origem da API recusa essa chamada com `fora_da_lista`. Provável: a origem do staging não está na lista de origens permitidas da API (variável de ambiente do staging), ou a rota do tutorial manda uma origem diferente das outras. Ver `apps/api/src/core/cors.ts` (linhas ~277 e ~296) e `apps/web/src/features/tutorial/`. O cadastro, que também é POST, funciona, então vale comparar o que o tutorial envia. |
| 3 | Feio | todas as páginas, anônimo | todas | Em toda página sem login o console mostra `401 GET /api/conta/aceites`. Em 100% das telas e larguras testadas. | — | Um componente de aceite legal chama a API sem checar se há sessão. Ver `apps/web/src/features/legal/JanelaDeNovoAceite.tsx` e `apps/web/src/app/api/conta/[...resto]/route.ts`. Deveria pular a chamada sem sessão, ou o proxy devolver 204. |
| 4 | Feio | `/conta/dados`, endereços, `/conta/favoritos`, `/conta/pedidos` | todas | Conta recém-criada só tem estados vazios ("Nenhum endereço salvo", "Nenhum produto favorito ainda", pedidos vazios). Para a apresentação não há como mostrar uma conta "viva". Consequência do item 1. | 05, 11 | Sem lojas não há o que favoritar nem pedir. Resolve junto com o item 1, com uma conta de cliente de demonstração que já tenha pedidos e favoritos. |
| 5 | Feio | rodapé e termos (todas) | todas | Os e-mails `suporte@simpleclick.com.br` e `privacidade@simpleclick.com.br` usam `simpleclick.com.br`; o site de staging está em `simplclick.com.br` (sem o "e"). Se o domínio real for o do staging, os e-mails não chegam. | — | Padrões fixos no código: `apps/web/src/features/legal/contato.ts:8` e `apps/web/src/lib/email-de-suporte.ts:5`. Conferir qual domínio é o oficial e se `EMAIL_DE_SUPORTE` está definido no ambiente. |
| 6 | Feio | `/explorar`, `/vender`, `/entrar`, `/cadastrar`, lojas (404) | 1440 a 390 | Banner de cookies cobre conteúdo: no 1440 cobre o quadro "Nenhum produto no feed"; no 768 cobre o botão de enviar do cadastro de loja; no 390 cobre o fim das seções e fica sobre a barra de baixo. | 02, 03, 06 | Já é o card #5. Anotado só como confirmação de que persiste no staging. |
| 7 | Feio | `/explorar` (e demais telas do cliente) | 390 | O seletor de região fica cortado: "Definir lo…". Ficam duas buscas na tela (ícone no topo e a caixa de busca abaixo). | 03, 04 | Largura fixa no cabeçalho móvel. Procurar o componente do seletor de região em `apps/web/src/features/`. |
| 8 | Menor | `/` landing | 390 | O menu da landing (Como funciona, Por dentro, Taxas, Comparar, Preço) não existe no celular: só aparecem o logo, "Entrar" e "Criar loja". As âncoras só são alcançáveis pela rolagem. | 09 | Navegação escondida abaixo de certa largura sem menu alternativo. Cabeçalho da landing em `apps/web/src/features/landing/`. |
| 9 | Menor | `/explorar`, `/conta/favoritos` | todas | O ícone dos estados vazios é só um traço "—", sem ilustração. | 05 | Ícone vazio no componente de estado vazio (`apps/web/src/features/feed/TelaDoFeed.tsx`, `apps/web/src/features/conta/LojasDaConta.tsx`). |
| 10 | Menor | `/conta/favoritos` | 1440 | "Vistas recentemente": o texto de apoio encosta na borda tracejada da caixa, sem respiro. | 05 | Falta margem entre o parágrafo e a caixa em `apps/web/src/features/conta/LojasDaConta.tsx`. |
| 11 | Menor | tutorial do cliente | 1440 | O texto diz "em quatro passos", mas o indicador mostra "1 DE 6". | 01 | Texto fixo em `apps/web/src/features/tutorial/passos.ts:163` fora de sincronia com a quantidade de passos. |
| 12 | Menor | `/` landing (rodapé de fontes) | — | O link do FAQ do Zé Delivery (`faq-parceiro.ze.delivery/...`) não abriu na checagem automática (erro de rede). Pode ser bloqueio a robô. | — | Link externo da seção de dados de mercado. Conferir à mão. |
| 13 | Menor | `/cadastrar` | todas | "Use pelo menos 12 caracteres" só aparece depois de o servidor recusar (`POST /api/auth/cadastro` → 422, visível no console). Falta validar no cliente antes de enviar. | 10 | Validação de senha só no servidor; formulário em `apps/web/src/features/` (cadastro). |
| 14 | Menor | `/` landing | 390, escuro | Uma carga da landing demorou 16 s (outras: 2–3 s). Não reproduzi, pode ter sido oscilação da rede. | — | Sem hipótese; reavaliar com medição repetida. |
| 15 | Menor | todas | todas | Aviso de console: o CSS `0yfvfzxkr8kda.css` é pré-carregado e não usado ("preloaded using link preload but not used"). | — | Preload do Next gerado por um CSS de rota que não é usada logo na landing. |

## O que estava bom

- Landing: animações por rolagem funcionam, imagens carregam, sem texto cortado nem rolagem horizontal em 1440 e 390 (cenas e simulador de taxas conferidos).
- Nenhuma imagem quebrada e nenhuma rolagem horizontal em nenhuma página nas 4 larguras e 2 temas.
- Foco visível (contorno de 2 px) nos botões testados. Contraste do texto parece adequado nos prints; **não medi** com ferramenta.
- Tema escuro do site consistente nas telas de cliente.
- O 401 anônimo e o 403 do tutorial são as únicas requisições 4xx/5xx de dados. Todo o resto é `net::ERR_ABORTED` de pré-carregamento do Next (normal ao navegar rápido) e os 404 esperados.

## Não coberto

- Salvar endereço, editar dados, favoritar e pedir (sem loja ativa e sem criar dados reais).
- Sacola e tela do WhatsApp (item 1).
- Medição de contraste com ferramenta e ordem de foco por teclado em todas as telas.
- Tempo de carregamento: só medição grosseira com `networkidle` (1 a 3 s nas páginas públicas).
