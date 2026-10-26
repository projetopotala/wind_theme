# P1 — Inscrições confirmadas pela secretaria (RASCUNHO)

> **Situação:** preparação técnica revisada (P1.1, P1.2 e P1.3). **Nada aqui está autorizado para aplicação.**
> O modelo B (pedido aprovado pela secretaria) ainda depende de decisão oficial do Instituto.
> **Prontidão técnica para implantar: NO-GO** — ver "Bloqueios de implantação".

Estes arquivos ficam **fora de `supabase/migrations`** de propósito: nenhuma ferramenta os aplica. Cada script que escreve no banco começa com uma trava que o faz **parar** se a sessão não declarar a autorização correspondente (`set potala.p1_aprovado = '<etapa>'`). Colar um deles por engano no SQL Editor não altera nada.

| Arquivo | O que é | Escreve? |
|---|---|---|
| `00_prechecagem_somente_leitura.sql` | Um único SELECT que verifica se os dados do painel aceitam a P1 | Não |
| `01_estrutura.RASCUNHO.sql` | PARTE 1: pedido identificado, vínculo comprovado, ocultação sem perda, unicidade | Sim (trava `estrutura`) |
| `02_projecao.RASCUNHO.sql` | PARTE 2: cópia automática para o Meu Potala, divergências e reconciliação | Sim (trava `projecao`) |
| `05_capacidade_turmas.RASCUNHO.sql` | Proteção de capacidade das turmas no banco (proposta separada da guarda) | Sim (trava `capacidade`) |
| `90_reversao_projecao.RASCUNHO.sql` | Desliga a cópia, sem apagar nem reexibir dados | Sim (trava `reverter-projecao`) |
| `91_reversao_estrutura.RASCUNHO.sql` | Remove a estrutura; **recusa** se houver dados que se perderiam | Sim (trava `reverter-estrutura`) |
| `92_reversao_capacidade.RASCUNHO.sql` | Remove só a proteção de capacidade; não mexe em dados | Sim (trava `reverter-capacidade`) |

## Como ler a pré-checagem
| Linha | Esperado | Se vier diferente |
|---|---|---|
| A. inscrição sem pessoa/turma | 0 | Corrigir esses registros no painel antes da PARTE 1 |
| B. situação desconhecida | 0 | A cópia registraria falha para esses registros: corrigir a situação no painel |
| C. pessoa e turma duplicadas | 0 | A PARTE 1 **para sozinha**. A secretaria decide qual inscrição fica |
| D. referência quebrada | 0 | A cópia usaria título genérico ou registraria falha |
| E, F, G | informativo | — |
| H. objetos da P1 já presentes | 0 | Algo já foi aplicado: parar e investigar antes de qualquer passo |
| I. turma acima da capacidade | 0 | A proteção de capacidade **para sozinha**. A secretaria decide quem fica |
| J. capacidade inválida | 0 | Corrigir no painel (inteiro >= 1 ou vazio) antes da proteção de capacidade |

## Falhas de cópia e reconciliação (PARTE 2)
- Uma falha na cópia **não desfaz** a gravação do painel. Ela vai para `public.enrollment_projection_issues` (só a administração lê).
- `select * from public.op_inscricoes_divergentes();` — somente leitura, só administração. Uma linha por problema: `sem_copia`, `situacao`, `copia_indevida`, `copia_orfa`, `falha_aberta`. Sem nome, e-mail ou dado de pedido.
- `select public.op_reconciliar_inscricoes();` — só administração. Entra na fila do `op_apply` (trava de `op_meta`), marca as falhas antigas como resolvidas, reprojeta todas as inscrições e oculta cópias órfãs. Devolve `{reprojetadas, orfas_ocultadas, falhas}`. É idempotente: rodar de novo não muda nada. Nunca apaga.
- O painel ainda **não** tem tela para isso; até lá, a administração usa o SQL Editor (pendência de interface).

## Troca de conta vinculada
- Ao ocultar uma cópia, o banco a tira da chave do curso (`course_ref = 'oculta:<id>'`). Só a **mesma** inscrição do painel, para a **mesma** conta e a **mesma** turma, a reexibe.
- Consequência testada: a conta anterior não vê a inscrição, o progresso nem o vínculo; nada que aconteça depois (mudança de turma, de situação, reconciliação, nova inscrição da conta anterior na mesma turma) reexpõe a linha antiga.
- O progresso registrado na conta anterior **não** passa para a conta nova (fica oculto com a linha antiga). Transferir progresso é decisão do Instituto.

## Capacidade das turmas (P1.3)
- **Causa da falha:** a regra de vagas existe só em `enrollment.save` e `offering.save`, no navegador. `op_apply` grava qualquer lista de mudanças que um administrador envie, verificando apenas permissão, identificador, revisão e formato. Nenhum gatilho olhava inscrições (a guarda pendente cuida de salas e agenda).
- **Contrato confirmado no código do painel:** `capacity` é inteiro >= 1 ou vazio (sem limite); ocupam vaga `active` e `completed`; `waitlist` e `cancelled` não ocupam.
- **Divergência encontrada (decisão pendente):** ao **reduzir** a capacidade, o painel conta também a lista de espera; ao **inscrever**, não. O banco aplica a regra comum (`active` + `completed`); o painel segue mais restritivo na redução.
- **Proteção:** gatilho de restrição **adiado** em `op_records` que, no fim da transação, confere ocupadas <= capacidade na turma de destino de cada inscrição gravada e em cada turma alterada. Recusa = a transação inteira é desfeita (sem inscrição, auditoria ou revisão parcial). Pega a trava de `op_meta`: todo gravador entra na mesma fila do `op_apply`.
- **Compatibilidade com a guarda pendente:** a guarda é um gatilho BEFORE (`op_records_validate_before_write`, salas e agenda); a proteção é um gatilho AFTER adiado, sem tocar em `validate_op_record`, no gatilho da guarda ou no `op_apply`. Testado com a guarda carregada. A ordem entre as duas é indiferente.
- **Teste futuro com duas sessões** (PostgreSQL servidor isolado, nunca o oficial):
  1. sessão A: `begin;` + `op_apply` inscrevendo a última vaga (sem `commit`);
  2. sessão B: `op_apply` inscrevendo outra pessoa na mesma turma, com a mesma revisão → deve **esperar** a trava de `op_meta`;
  3. A: `commit` → B recebe PT409 (revisão desatualizada); repetir B com a revisão nova → recusa por capacidade;
  4. repetir com B gravando direto em `op_records` (sem `op_apply`) → B espera na trava ao fim da transação e é recusada por capacidade;
  5. conferir que nenhuma das recusas deixa auditoria nem revisão avançada, e medir se há deadlock.

## Bloqueios de implantação
1. **Capacidade:** a correção existe em rascunho (`05_capacidade_turmas`) e passou no PostgreSQL isolado, mas a concorrência com duas sessões **não** foi homologada (o PGlite tem uma conexão). Ela precisa ser aplicada antes da PARTE 2, e a divergência do painel sobre lista de espera na redução de vagas precisa de decisão.
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
| Concorrência real: vínculo × `op_apply` × reconciliação × verificação de capacidade em sessões simultâneas; espera e deadlock na trava de `op_meta` (roteiro na seção de capacidade) | PGlite tem uma única conexão |
| Inserção pelo site via PostgREST (`Prefer: return=minimal`), com JWT de `anon` e de `authenticated`, incluindo a recusa de `user_id` no corpo | Não há PostgREST; o JWT é simulado com `request.jwt.claim.sub` |
| Dono das funções SECURITY DEFINER (`postgres` no Supabase, sem superusuário) lendo `op_records`, `op_profile_accounts` e `site_interests` sob RLS | No PGlite o dono é superusuário, que ignora RLS |
| Gatilho de identidade (`security invoker`) executado como `anon` e `authenticated` reais | Papéis simulados com `set role` |
| Coexistência com a guarda operacional aplicada e com os gatilhos/ganchos que o Supabase instala | Só a migration da guarda do repositório foi carregada |
| Desempenho: o gatilho de cópia roda em toda gravação de `op_records`; a reconciliação percorre todas as inscrições | Volume de teste mínimo |
| O painel (`outputs/js/admin/operations`) chamando `op_apply` com a cópia ativa | Teste só no banco, sem a interface |
