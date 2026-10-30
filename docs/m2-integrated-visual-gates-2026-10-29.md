# Marco 2 — gates da homologação visual integrada (29/10/2026)

Branch local: `codex/m2-integrated-lab-preview`. Supabase exclusivo: `hmspabllgxqfzzricijv`. Nenhuma Preview externa foi publicada nesta verificação.

| Verificação | Estado | Evidência / próximo gate |
| --- | --- | --- |
| Frente C no laboratório | PASS | 31 verificações HTTP reais, registradas na Frente C. |
| P4.1 no laboratório | PASS | 26 verificações HTTP reais, registradas na integração. |
| Portal local | PASS | Após ativação restrita da Preview: 1286/1286 testes Potala, lint e validate PASS. O teste de servidor local exigiu permissão de conexão a `127.0.0.1`. |
| `npm test` genérico | FAIL | Dois testes em `tests/rendered-html.test.mjs` verificam o esqueleto de desenvolvimento (`codex-preview` e `app/_sites-preview/SkeletonPreview.tsx`), ausentes do portal estático `outputs/`. O build da rotina passou. Pode bloquear CI se exigido. |
| Isolamento Supabase no frontend | PASS local | `outputs/js/supabase/config.js` aponta para o laboratório com chave publicável; nenhuma referência ao Project ID de produção foi encontrada em `outputs/`. |
| Projeto Vercel separado | BLOCKED | Não criado; requer autorização antes de criar/publicar. Projeto existente `wind-theme` continua intocado. |
| Auth da Preview | BLOCKED | Site URL do laboratório: `http://localhost:3000`; lista de Redirect URLs vazia. Cadastrar somente a origem isolada após fixar URL. |
| Agendamento público no navegador | BLOCKED | Flag pública permanece false, site key Turnstile vazia e nenhuma Edge Function implantada no laboratório. Exige widget real e autorização remota. |
| Agendamento autenticado no navegador | PRONTO LOCALMENTE | `submit_appointment_slot_request` tem EXECUTE para authenticated no laboratório. `submit_authenticated_appointment_request` permanece bloqueada, mas não é chamada pelo formulário de horários atual. `lab-preview.js` ativa a vista apenas no hostname exato proposto e com URL do laboratório. Teste visual ainda pendente. |
| Painel administrativo e reservas no navegador | PRONTO LOCALMENTE | `create_appointment_slot` e `confirm_appointment_request_reservation` têm EXECUTE para authenticated e guardas de admin no banco. A ativação em `lab-preview.js` é exclusiva da origem proposta. Teste visual ainda pendente. |
| Home, P4.1, Meu Potala, B, C, mobile e desktop | BLOCKED | Aguardam URL externa isolada e execução no navegador. |

Destino proposto: projeto Vercel novo na equipe `potala`, raiz `outputs`, preset `Other`, sem build customizado e sem variáveis de produção. URL candidata: `https://wind-theme-m2-lab-preview.vercel.app` (a confirmar na criação). Repositório: `projetopotala/wind_theme`, branch integrada, nunca `main` como fonte da Preview. O projeto atual usa `outputs` como Root Directory, preset `Other` e não tem variáveis de ambiente registradas pela integração Vercel.

Redirects Auth necessários, com a origem final exata: `/confirmar-conta`, `/meu-potala/configuracoes`, `/meu-potala` e `/admin` para recuperação administrativa. Não cadastrar curinga amplo nem domínio de produção. Testes de e-mail ficam sujeitos ao limite HTTP 429 do Auth; não contornar.

Turnstile: não há sessão Cloudflare autenticada disponível. As chaves oficiais de teste são adequadas apenas para laboratório restrito, mas o Siteverify de teste devolve `hostname` e `action` de teste, enquanto o handler exige a origem exata e `appointment_request`. Não enfraquecer essa verificação para publicar o formulário. O widget real deve ser criado para o hostname definitivo e sua secret key configurada somente nos segredos da Edge Function.
