# Endereço na conta e no pedido (etapa 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** O cliente cadastra o endereço de entrega na conta; o pedido guarda uma cópia dele; o painel e o comprovante o mostram.

**Spec:** `docs/superpowers/specs/2026-11-23-contas-e-frete-design.md` (seção "Endereço (etapa 2)"). Etapa 3 (frete) fica de fora.

## Global Constraints

- Mesmas regras do projeto: commits só `fix`/`feat`/`chore` de uma linha, sem citar IA, **sem push**; comentários em português; visual preto e branco, texto legível; TDD e mutação nas guardas de segurança.
- Um endereço por conta. CEP com 8 dígitos; UF uma das 27; número até 10 caracteres ("S/N" vale); complemento opcional.
- O pedido guarda uma **cópia** do endereço (mudar a conta depois não muda pedidos feitos).
- Comprar passa a exigir endereço completo (422 com `code: "sem-endereco"`).
- CEP consultado **no servidor** (ViaCEP), só para quem está logado, com limite de uso e prazo curto; se falhar, o cliente digita à mão. O CEP digitado nunca vira parte de um endereço de API sem validação (só 8 dígitos).
- Excluir a conta apaga o endereço da conta e a cópia dos pedidos já **entregues ou cancelados** (pedidos em andamento mantêm a cópia até o fim da entrega).

## Review Focus

- CEP com máscara, curto, com letras, com `../`, com `%` ou quebra de linha: nunca chega à consulta externa.
- Endereço com caracteres de controle, textos enormes, UF inventada ("XX"), número vazio: recusados.
- Pedido de outro cliente nunca mostra o endereço; o painel mostra; o comprovante do dono mostra.
- ViaCEP fora do ar, lento, devolvendo `{erro:true}` ou lixo: o formulário continua usável.
- Excluir a conta: endereço da conta e cópia dos pedidos encerrados somem; pedido em andamento mantém.

### Task 1: Migração 0009 e esquema
Colunas de endereço em `customers` (`address_zip`, `address_street`, `address_number`, `address_complement`, `address_district`, `address_city`, `address_state`) e cópia em `orders` (`ship_*`), com CHECKs (CEP 8 dígitos, UF na lista, endereço todo-ou-nada). `up`/`down` em `db/migrations/`.
- [ ] Teste do esquema (RED), migração, `schema.ts`, ajuste do teste de subida/descida, commits.

### Task 2: Validação e gravação (`src/server/customers/address.ts`)
`parseAddressForm(form): { ok, data } | { ok:false, error }`, `saveAddress(id, addr)`, `getAddress(id): Address | null` (null se incompleto), `UFS`, `formatCep`.
- [ ] Testes (RED) com todos os casos do Review Focus; implementação; mutações.

### Task 3: Consulta de CEP (`src/server/cep.ts` + `GET /api/cep/[cep]`)
`lookupCep(cep): Promise<{street,district,city,state} | null>` com ViaCEP, prazo de 5 s, resposta validada. Rota exige sessão, limite de 30 consultas por 10 min por cliente, 400 para CEP inválido, 404 quando não existe, 502 quando a consulta falha.
- [ ] Testes com `fetch` simulado (RED), implementação, mutações.

### Task 4: Pedido guarda o endereço
`createOrder(input, customerId, address?)` grava a cópia; `POST /api/orders` lê o endereço da conta e responde 422 `sem-endereco` se faltar. `anonymizeCustomer` apaga o endereço da conta e a cópia dos pedidos entregues/cancelados.
- [ ] Testes (RED), implementação, ajustes nos testes existentes, mutações.

### Task 5: Telas
Etiqueta "Endereço" em `/conta` (formulário com busca de CEP), aviso na sacola, bloco "Entrega" no comprovante do cliente, endereço na ordem e na caderneta do painel; texto da política de privacidade.
- [ ] Implementar, verificar no navegador, commits.

### Task 6: Fechamento
README, `tsc`, `eslint`, suíte completa, build; ledger. **Sem push.**
