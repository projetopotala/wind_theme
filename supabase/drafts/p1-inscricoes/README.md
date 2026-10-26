# P1 — Inscrições confirmadas pela secretaria (RASCUNHO)

> **Situação:** preparação técnica revisada (P1.1 e P1.2). **Nada aqui está autorizado para aplicação.**
> O modelo B (pedido aprovado pela secretaria) ainda depende de decisão oficial do Instituto.
> **Prontidão técnica para implantar: NO-GO** — ver "Bloqueios de implantação".

Estes arquivos ficam **fora de `supabase/migrations`** de propósito: nenhuma ferramenta os aplica. Cada script que escreve no banco começa com uma trava que o faz **parar** se a sessão não declarar a autorização correspondente (`set potala.p1_aprovado = '<etapa>'`). Colar um deles por engano no SQL Editor não altera nada.

| Arquivo | O que é | Escreve? |
|---|---|---|
| `00_prechecagem_somente_leitura.sql` | Um único SELECT que verifica se os dados do painel aceitam a P1 | Não |
| `01_estrutura.RASCUNHO.sql` | PARTE 1: pedido identificado, vínculo comprovado, ocultação sem perda, unicidade | Sim (trava `estrutura`) |
| `02_projecao.RASCUNHO.sql` | PARTE 2: cópia automática para o Meu Potala, divergências e reconciliação | Sim (trava `projecao`) |
| `90_reversao_projecao.RASCUNHO.sql` | Desliga a cópia, sem apagar nem reexibir dados | Sim (trava `reverter-projecao`) |
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

## Falhas de cópia e reconciliação (PARTE 2)
- Uma falha na cópia **não desfaz** a gravação do painel. Ela vai para `public.enrollment_projection_issues` (só a administração lê).
- `select * from public.op_inscricoes_divergentes();` — somente leitura, só administração. Uma linha por problema: `sem_copia`, `situacao`, `copia_indevida`, `copia_orfa`, `falha_aberta`. Sem nome, e-mail ou dado de pedido.
- `select public.op_reconciliar_inscricoes();` — só administração. Entra na fila do `op_apply` (trava de `op_meta`), marca as falhas antigas como resolvidas, reprojeta todas as inscrições e oculta cópias órfãs. Devolve `{reprojetadas, orfas_ocultadas, falhas}`. É idempotente: rodar de novo não muda nada. Nunca apaga.
- O painel ainda **não** tem tela para isso; até lá, a administração usa o SQL Editor (pendência de interface).

## Troca de conta vinculada
- Ao ocultar uma cópia, o banco a tira da chave do curso (`course_ref = 'oculta:<id>'`). Só a **mesma** inscrição do painel, para a **mesma** conta e a **mesma** turma, a reexibe.
- Consequência testada: a conta anterior não vê a inscrição, o progresso nem o vínculo; nada que aconteça depois (mudança de turma, de situação, reconciliação, nova inscrição da conta anterior na mesma turma) reexpõe a linha antiga.
- O progresso registrado na conta anterior **não** passa para a conta nova (fica oculto com a linha antiga). Transferir progresso é decisão do Instituto.

## Bloqueios de implantação
1. **Capacidade das turmas só é validada no navegador.** `op_apply` serializa as gravações (trava de `op_meta` + revisão: duas gravações sobre a mesma revisão → a segunda recebe PT409), então dois administradores honestos não estouram vagas ao mesmo tempo. Mas o banco **aceita** uma gravação que exceda a capacidade se o cliente não validar (comprovado no teste). A guarda operacional pendente não cobre inscrições. Validar capacidade no banco exige ampliar a guarda — **não autorizado**; decidir antes da PARTE 2.
2. Decisão institucional (modelo B e decisões abertas).
3. Testes que só o Supabase pode responder (abaixo).
4. Tela de divergências/reconciliação no painel (ou procedimento operacional aprovado para usar o SQL Editor).

## Testes
- **Estáticos (texto), no `test:portal`:** `tests/potala/p1-inscricoes-rascunho.test.mjs`. Só garantem a forma. **Não provam segurança.**
- **Integração em PostgreSQL 16 isolado (PGlite, em memória)**, com as migrations reais do repositório e um esboço do esquema `auth`:
  ```
  node scripts/p1-inscricoes-pglite-executar.mjs
  ```
  O executor instala `@electric-sql/pglite@0.2.17` (versão fixa) numa pasta própria em `os.tmpdir()`, **fora do projeto**, sem tocar em `package.json`, `package-lock.json` nem `node_modules` do portal, e a reaproveita nas execuções seguintes. Para usar outra pasta (ex.: máquina sem rede com o pacote já copiado): `P1_PGLITE_DIR=<pasta> node scripts/p1-inscricoes-pglite-executar.mjs`. Saída 0 = tudo passou; 1 = falha; 2 = PGlite indisponível (teste pendente, não aprovado).

## O que ainda exige o ambiente real (PostgreSQL com várias sessões, PostgREST, JWT, ownership do Supabase)
| Pendência | Por que o PGlite não responde |
|---|---|
| Concorrência real: vínculo × `op_apply` × reconciliação em sessões simultâneas; espera e deadlock na trava de `op_meta` | PGlite tem uma única conexão |
| Inserção pelo site via PostgREST (`Prefer: return=minimal`), com JWT de `anon` e de `authenticated`, incluindo a recusa de `user_id` no corpo | Não há PostgREST; o JWT é simulado com `request.jwt.claim.sub` |
| Dono das funções SECURITY DEFINER (`postgres` no Supabase, sem superusuário) lendo `op_records`, `op_profile_accounts` e `site_interests` sob RLS | No PGlite o dono é superusuário, que ignora RLS |
| Gatilho de identidade (`security invoker`) executado como `anon` e `authenticated` reais | Papéis simulados com `set role` |
| Coexistência com a guarda operacional aplicada e com os gatilhos/ganchos que o Supabase instala | Só a migration da guarda do repositório foi carregada |
| Desempenho: o gatilho de cópia roda em toda gravação de `op_records`; a reconciliação percorre todas as inscrições | Volume de teste mínimo |
| O painel (`outputs/js/admin/operations`) chamando `op_apply` com a cópia ativa | Teste só no banco, sem a interface |
