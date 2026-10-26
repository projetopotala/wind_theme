# P1 — Inscrições confirmadas pela secretaria (RASCUNHO)

> **Situação:** preparação técnica revisada (P1.1). **Nada aqui está autorizado para aplicação.**
> O modelo B (pedido aprovado pela secretaria) ainda depende de decisão oficial do Instituto.

Estes arquivos ficam **fora de `supabase/migrations`** de propósito: nenhuma ferramenta os aplica. Cada script que escreve no banco começa com uma trava que o faz **parar** se a sessão não declarar a autorização correspondente (`set potala.p1_aprovado = '<etapa>'`). Colar um deles por engano no SQL Editor não altera nada.

| Arquivo | O que é | Escreve? |
|---|---|---|
| `00_prechecagem_somente_leitura.sql` | Um único SELECT que verifica se os dados do painel aceitam a P1 | Não |
| `01_estrutura.RASCUNHO.sql` | PARTE 1: pedido identificado, vínculo comprovado, ocultação sem perda, unicidade | Sim (trava `estrutura`) |
| `02_projecao.RASCUNHO.sql` | PARTE 2: cópia automática do painel para o Meu Potala | Sim (trava `projecao`) |
| `90_reversao_projecao.RASCUNHO.sql` | Desliga a cópia, sem apagar dados | Sim (trava `reverter-projecao`) |
| `91_reversao_estrutura.RASCUNHO.sql` | Remove a estrutura; **recusa** se houver dados que se perderiam | Sim (trava `reverter-estrutura`) |

## Como ler a pré-checagem
| Linha | Esperado | Se vier diferente |
|---|---|---|
| A. inscrição sem pessoa/turma | 0 | Corrigir esses registros no painel antes da PARTE 1 |
| B. situação desconhecida | 0 | A cópia registraria falha para esses registros: corrigir a situação no painel |
| C. pessoa e turma duplicadas | 0 | A PARTE 1 **para sozinha**. A secretaria decide qual inscrição fica |
| D. referência quebrada | 0 | A cópia usaria título genérico ou registraria falha |
| E, F, G | informativo | — |
| H. objetos da P1 já presentes | 0 | Algo já foi aplicado: parar e investigar antes de qualquer passo |

## Sequência (cada passo só com autorização explícita)
1. Decisão do Instituto (modelo B e as decisões abertas).
2. Pré-checagem no banco oficial (somente leitura). Tratar A–D.
3. PARTE 1. Verificação somente leitura logo depois.
4. Telas: pedido logado identificado e vínculo no painel (sem PR nesta rodada).
5. PARTE 2, depois de homologar a etapa 4.
6. Homologação com contas de teste (depende do SMTP).

## Testes
- **Estáticos (texto), no `test:portal`:** `tests/potala/p1-inscricoes-rascunho.test.mjs`. Só garantem a forma: travas, separação, grants, `search_path`, ausência de `delete`. **Não provam segurança.**
- **Integração em PostgreSQL isolado:** `scripts/p1-inscricoes-pglite.mjs`, com PostgreSQL 16 (PGlite, em memória), as migrations reais do repositório e um esboço do esquema `auth`. Fora do `test:portal` porque depende de um pacote que o projeto não instala:
  ```
  npm install --no-save @electric-sql/pglite@0.2.17
  node scripts/p1-inscricoes-pglite.mjs
  ```
- **Ainda pendente (só no Supabase, com autorização):** PostgREST e JWT reais, dono das funções no projeto oficial, concorrência entre duas sessões (o PGlite tem uma conexão só) e desempenho com o volume real.
