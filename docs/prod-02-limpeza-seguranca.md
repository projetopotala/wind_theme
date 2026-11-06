# PROD-02 — Limpeza de segurança (autenticação legada)

Escopo: remover a segunda credencial `public.users.password_hash` e as funções
`set_portal_user_password(text,text)` e `verify_portal_password(text,text)`.
A migration `202611060004_remove_legacy_portal_password.sql` está **preparada e não aplicada**.

## Dependências verificadas (06/11/2026)

| Onde | Resultado |
|---|---|
| Código ativo (`outputs/`, `supabase/functions/`, `scripts/`) | Nenhuma referência. Protegido pelo teste `limpeza-seguranca-legado.test.mjs`. |
| Banco oficial (funções, views, triggers, políticas, índices, constraints, cron) | Nenhuma dependência além das duas funções e da coluna. |
| Grants | Funções: só `postgres`. Coluna: `service_role` tem grants da tabela (sem uso). `anon` e `authenticated` não têm acesso. |
| Dados | `public.users` tem 1 linha (owner) e 1 `password_hash` preenchido, sem uso: o login é só pelo Supabase Auth. |
| Histórico | A migration antiga `202609180001` removia os mesmos objetos, mas nunca entrou no histórico remoto e mistura outras mudanças. Não será reparada. |

## Backup antes de aplicar

O único dado descartado é o hash do owner. Reverter o esquema recria a coluna vazia e **não devolve o hash**.
Como o login não usa esse hash, a perda não afeta o acesso. Mesmo assim, antes de aplicar:

1. Exportar `select id, email, password_hash from public.users` para um arquivo privado fora do repositório (nunca em Git, chat ou log).
2. Conferir que o login do owner funciona pelo Supabase Auth.

## Aplicação (somente com autorização)

Padrão já usado: um arquivo `begin; <SQL da migration>; insert into supabase_migrations.schema_migrations(version,name,statements) ...; commit;`
via `supabase db query --remote=gotrumwuimpoeggwamut --yes -f`. Sem `db push`.
Verificação posterior: as duas funções e a coluna não existem; 1 admin; login do owner OK.

## Recuperação

Funções e coluna podem ser recriadas pelo SQL de `202609080005_portal_user_password.sql`, mas ficam sem dados e sem uso. Não há motivo funcional para restaurá-las.

## Vercel

Variável obsoleta: `POTALA_APPOINTMENT_E2E_PREVIEW`, escopo Preview, branch `codex/appointments-livekit-production`. Ela é inerte, porque o código só habilita o Preview E2E na branch `feat/identidades-permissoes`. Production não tem essa variável.
Mantida: a da branch `feat/identidades-permissoes`.
Remoção (pendente de autorização):
`vercel env rm POTALA_APPOINTMENT_E2E_PREVIEW preview codex/appointments-livekit-production --scope potala --project wind-theme`

## LiveKit

O código e as Edge Functions só leem `LIVEKIT_URL`, `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET` dos segredos do Supabase. O nome `potala-portal-production` não aparece no código. Emissão de token, encerramento e varredor usam o mesmo par de segredos, hoje a chave dedicada nova (token validado, sala criada e revogada pelo varredor em 06/11).
Revogar a chave antiga não afeta novas salas nem o varredor. Tokens emitidos com a chave antiga (válidos por 90 s) já expiraram, e quem estiver numa sala continua conectado.
Procedimento manual no Dashboard LiveKit (projeto `projetopotala`):
1. Settings → Keys: identificar a chave `potala-portal-production`. Não tocar na chave `codex-potala-institucional`.
2. Conferir que a chave em uso pelo portal é outra (a dedicada nova) e que o último uso da antiga é anterior à troca.
3. Revogar apenas a antiga.
4. Validar: abrir uma consulta de teste só se houver uma agendada, ou conferir que a próxima emissão de token responde 200.
Nenhum segredo deve ser colado em chat ou log.

## SMTP

Fluxos que enviam e-mail (todos via Supabase Auth):
- Cadastro no Meu Potala (`signUp`, link para `confirmar-conta`).
- Recuperação de senha no Meu Potala e na Central Administrativa (`resetPasswordForEmail`).
Situação: SMTP padrão do Supabase, com limite baixo de envios e remetente genérico, adequado só a testes.
Necessário para produção: provedor SMTP (ou Gmail com senha de app como solução temporária), remetente em domínio próprio e, para boa entrega, DNS SPF/DKIM/DMARC. Configuração no Dashboard do Supabase, sem passar senhas pelo chat. Não contratado nem alterado nesta etapa.

## Fora do escopo

`scripts/run-m2c-lab.mjs` insere um admin sintético com service role, só para o laboratório (`hmspabllgxqfzzricijv`), e não é referenciado pelo produto. Mantido; o teste de regressão cobre o código do produto.
