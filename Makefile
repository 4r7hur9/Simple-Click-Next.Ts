SHELL := /bin/bash
.DEFAULT_GOAL := ajuda

ONP := node $(HOME)/.claude/skills/onp-spec-driven/scripts/onp-spec.mjs

.PHONY: ajuda setup up down seed test verificar audit limpar

ajuda: ## mostra os comandos disponíveis
	@grep -hE '^[a-z-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-12s\033[0m %s\n", $$1, $$2}'

setup: ## instala dependências e prepara o ambiente local
	@corepack enable
	@corepack prepare pnpm@11.22.0 --activate
	@pnpm install
	@pnpm lefthook install
	@echo "pronto — agora: make up"

up: ## sobe banco, cache, roteador, API e site
	@bash infra/scripts/up.sh

down: ## derruba o ambiente local
	@docker compose -f infra/compose/docker-compose.yml down

seed: ## carrega os dados de exemplo no banco de desenvolvimento
	@pnpm --filter @simpleclick/database seed

test: ## roda unidade e integração
	@pnpm turbo run test:unit test:int

verificar: ## portão completo: tipos, qualidade, testes, telas e auditoria da spec
	@bash infra/scripts/verificar.sh

audit: ## auditoria da especificação contra o código
	@$(ONP) audit

limpar: ## remove saídas de build e caches
	@rm -rf **/dist **/.next **/.turbo **/coverage
	@echo "limpo"
