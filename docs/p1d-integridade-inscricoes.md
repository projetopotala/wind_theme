# P1D — Integridade das inscrições no banco

Migration: `supabase/migrations/202611120001_integridade_inscricoes.sql` (**preparada, não aplicada**).
Rollback: `supabase/rollbacks/202611120001_rollback_integridade_inscricoes.sql`.
Verificação antes e depois (somente leitura): `supabase/ops/p1d-preflight-inscricoes.sql`.
Homologação no LAB (transação que se desfaz sozinha): `supabase/ops/p1d-homologacao-lab.sql`.

## 1. Lacunas (antes da P1D)
`op_apply` grava as alterações recebidas conferindo só permissão (`is_portal_admin`), revisão (`PT409`), chave de repetição, coleção permitida e `id` do documento. `validate_op_record` cobre só salas e agenda. As regras de inscrição existiam apenas no motor do navegador (`operations/schedule.js`). Uma conta com administração podia, com `op_apply` montado à mão e a revisão em dia:
- inscrever a mesma pessoa duas vezes na mesma turma;
- passar da capacidade (inscrição nova, reativação ou promoção da lista de espera);
- gravar pessoa/turma inexistentes, identificador inválido ou situação fora da lista;
- alterar inscrições ou turmas com uma ação declarada diferente (e o contrário).

Testes que registram a linha de base: `tests/potala/op-apply-inscricoes-banco.test.mjs` (sem P1D).

## 2. Modelo real (conferido no código e nas migrations)
| Item | Valor |
|---|---|
| Inscrição | `op_records`, `collection = 'enrollments'`; documento `{id, profile_id, offering_id, status, created_at, updated_at}` |
| Situações | `active`, `waitlist`, `completed`, `cancelled` (motor: `enrollment.save`) |
| Ocupa vaga | `active` e `completed` |
| Turma | `collection = 'activity_offerings'`; `capacity` inteiro ≥ 1 ou `null` (sem limite) |
| Pessoa | `collection = 'profiles'` |
| Duplicidade (motor) | uma inscrição por pessoa+turma em **qualquer** situação; reinscrição = editar a mesma (ex.: `cancelled` → `active`) |
| Transições (motor) | livres entre as quatro situações; só a vaga limita |
| Quem escreve | só `op_apply`: inscrições pela ação `enrollment.save`, turmas por `offering.save` (código e auditoria de Production) |

## 3. Regras implementadas no banco
1. **Uma inscrição por pessoa e turma** — índice único parcial `op_records_enrollment_pessoa_turma` (vale entre transações; não bloqueia reinscrição, que é edição).
2. **Situação e referências** — situação entre as quatro; `profile_id`/`offering_id` textos não vazios, sem espaços nas pontas, até 160 caracteres, apontando para pessoa e turma existentes.
3. **Capacidade** — inscrição que ocupa vaga não passa da capacidade (inscrição nova, reativação, promoção, troca de turma); turma não pode ter a capacidade reduzida abaixo das vagas ocupadas; capacidade inválida (0, texto, decimal) é recusada.
4. **Remoção** — pessoa ou turma com inscrição, e inscrição ligada a participante de aula, não podem ser apagadas.
5. **Escopo** — o evento de auditoria que `op_apply` grava na mesma transação diz a ação e as coleções alteradas: inscrições só por `enrollment.save` (que só altera inscrições); turmas só por `offering.save` (que só altera turmas). A recusa desfaz a operação inteira.

**Concorrência:** a verificação de capacidade trava a turma (`pg_advisory_xact_lock` por turma, liberado no fim da transação) antes de contar; inscrição e mudança de capacidade usam a mesma trava; troca de turma trava as duas em ordem fixa. A unicidade é do índice. Nada depende só do `PT409`.

**O que não muda:** `op_apply`, `op_snapshot`, `my_course_enrollments`, grants, RLS, papéis, formato dos documentos e registros existentes.

Códigos: `23505` duplicata · `23514` capacidade · `23503` referência/remoção · `22023` situação, identificador, capacidade inválida ou escopo · `42501` sem administração (já existia).

## 4. Provas
- Rollback, múltiplos registros, atomicidade da auditoria e o script de homologação do LAB também são validados por `scripts/p1d-concorrencia-postgres.mjs` (23 cenários) numa instância descartável.
- `tests/potala/p1d-integridade-inscricoes-banco.test.mjs` (PGlite, migrations reais, chamadas diretas a `op_apply`).
- `scripts/p1d-concorrencia-postgres.mjs` — PostgreSQL 17 temporário e isolado, várias sessões simultâneas (última vaga, mesmo aluno, promoção simultânea, cancelamento confirmado e desfeito, redução de capacidade, 12 sessões para 3 vagas, op_apply concorrente, repetição de chave). Uso: `node scripts/p1d-concorrencia-postgres.mjs`.

## 5. Plano de aplicação (exige autorização expressa)
1. **Pré-checagem em Production (leitura):** rodar `supabase/ops/p1d-preflight-inscricoes.sql`; todos os contadores de `bloqueia_aplicacao` devem ser 0. A própria migration recusa se não forem.
2. **LAB primeiro (`hmspabllgxqfzzricijv`)**, com autorização de escrita e acesso de administração ao banco do LAB (CLI vinculado ou SQL Editor do projeto): aplicar só esta migration; rodar a pré-checagem (bloco `instalado`); rodar `supabase/ops/p1d-homologacao-lab.sql` — ele termina com o erro proposital "P1D-HOMOLOGACAO desfeita (nada gravado). Falhas: 0" e a lista dos 24 casos; homologar no painel (seção 6).
3. **Production (`gotrumwuimpoeggwamut`)**: aplicar **somente** `202611120001_integridade_inscricoes.sql` pelo procedimento controlado, registrando só esta versão no histórico. **Não** usar `db push` em lote nem `migration repair` em versões antigas (issue #52).
4. Rodar de novo a pré-checagem (`instalado`: 3 gatilhos, índice, 3 funções; `gatilhos_todos` mantém os 4 anteriores).
5. Publicar o frontend da PR (mensagem em português para duplicata) — pode ir antes ou depois da migration; sem a migration a mensagem nova simplesmente não aparece.

## 6. Homologação (sem dados reais; LAB ou turma de demonstração)
1. Inscrever alguém em turma com vaga → grava.
2. Inscrever a mesma pessoa de novo → recusa (pelo painel: motor; o banco também recusaria).
3. Encher a turma e tentar mais uma ativa → recusa; lista de espera → aceita.
4. Promover da espera sem vaga → recusa; cancelar uma ativa e promover → aceita.
5. Reduzir a capacidade abaixo das ocupadas → recusa.
6. Assistente "Organizar um curso" completo → igual a antes.
7. Meu Potala do aluno → curso, professor, próxima aula e link iguais.

## 7. Riscos
- **Ordem das alterações num mesmo pedido:** a capacidade é conferida linha a linha. Um único `op_apply` que liberasse uma vaga e ocupasse outra, nessa ordem invertida, seria recusado. O motor atual nunca gera isso (uma inscrição por comando).
- **Escopo:** só inscrições e turmas ganharam regra de escopo. As demais coleções seguem como antes (fora do escopo da P1D).
- **Auditoria de outras funções SQL:** a regra de escopo só age quando o evento cita `enrollments`/`activity_offerings` ou as ações `enrollment.save`/`offering.save`; as funções de atendimento não fazem isso.
- **Mensagens:** erros do banco chegam ao painel; a duplicata ganhou tradução. Capacidade, referência e escopo já saem em português.

## 8. Rollback
Executar `supabase/rollbacks/202611120001_rollback_integridade_inscricoes.sql` (pelo mesmo procedimento controlado). Remove 3 gatilhos, 3 funções e o índice; **não altera registros**; confere que a guarda anterior (`op_records_validate_before_write`) continua ativa. O efeito é voltar ao comportamento anterior (regras só no motor do painel).
