# TV sem aviso de cookies nem janela de acesso (D-3, AC-925)

**Regra.** Na rota `/loja/<apelido>/tv` não se montam o aviso de cookies
(`BannerDeCookies`) nem a janela de entrar/criar conta (`JanelaDeAcesso`).
O reconhecimento da rota está em `apps/web/src/features/tv/rota-da-tv.ts` e o
corte em `ForaDaTv.tsx`, usado em `app/layout.tsx` e em `app/(loja)/loja/[slug]/layout.tsx`.

**Por quê.** A TV é um quiosque sem teclado nem ponteiro: um cartão por cima do
cardápio nunca sai (AC-925: nada para tocar).

**LGPD.** A exibição é pública, sem login, e só lê o catálogo público. Não grava
cookie de desempenho, análise nem preferência; os únicos cookies são os
essenciais, que dispensam consentimento. Sem coleta não essencial, não há
escolha a pedir. Se a TV um dia passar a coletar algo não essencial, esta
exceção deve ser revista. As demais rotas continuam mostrando o aviso, e o link
"Preferências de cookies" do rodapé segue valendo onde há rodapé.
