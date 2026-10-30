# Marco 2 — gates da homologação visual integrada (29/10/2026)

Branch local: `codex/m2-integrated-lab-preview`. Supabase exclusivo: `hmspabllgxqfzzricijv`. Nenhuma Preview externa foi publicada nesta verificação.

| Verificação | Estado | Evidência / próximo gate |
| --- | --- | --- |
| Frente C no laboratório | PASS | 31 verificações HTTP reais, registradas na Frente C. |
| P4.1 no laboratório | PASS | 26 verificações HTTP reais, registradas na integração. |
| Portal local | PASS | 1285 testes Potala, lint, build e validate na integração antes do merge explícito T-01; merge posterior alterou somente a rastreabilidade documental. |
| `npm test` genérico | FAIL | Dois testes em `tests/rendered-html.test.mjs` verificam o esqueleto de desenvolvimento (`codex-preview` e `app/_sites-preview/SkeletonPreview.tsx`), ausentes do portal estático `outputs/`. O build da rotina passou. Pode bloquear CI se exigido. |
| Isolamento Supabase no frontend | PASS local | `outputs/js/supabase/config.js` aponta para o laboratório com chave publicável; nenhuma referência ao Project ID de produção foi encontrada em `outputs/`. |
| Projeto Vercel separado | BLOCKED | Não criado; requer autorização antes de criar/publicar. Projeto existente `wind-theme` continua intocado. |
| Auth da Preview | BLOCKED | Site URL do laboratório: `http://localhost:3000`; lista de Redirect URLs vazia. Cadastrar somente a origem isolada após fixar URL. |
| Agendamento público no navegador | BLOCKED | `APPOINTMENT_REQUESTS_ENABLED=false`, site key Turnstile vazia e nenhuma Edge Function implantada no laboratório. Não declarar PASS visual. |
| Painel administrativo e reservas no navegador | BLOCKED | `APPOINTMENT_ADMIN_ENABLED=false` e `APPOINTMENT_RESERVATIONS_ENABLED=false`; exige ativação limitada à Preview de laboratório e teste visual real. |
| Home, P4.1, Meu Potala, B, C, mobile e desktop | BLOCKED | Aguardam URL externa isolada e execução no navegador. |

Destino proposto: projeto Vercel novo na equipe `potala`, raiz `outputs`, preset `Other`, sem build customizado e sem variáveis de produção. URL candidata: `https://wind-theme-m2-lab-preview.vercel.app` (a confirmar na criação). Repositório: `projetopotala/wind_theme`, branch integrada, nunca `main` como fonte da Preview. O projeto atual usa `outputs` como Root Directory, preset `Other` e não tem variáveis de ambiente registradas pela integração Vercel.

Redirects Auth necessários, com a origem final exata: `/confirmar-conta`, `/meu-potala/configuracoes`, `/meu-potala` e `/admin` para recuperação administrativa. Não cadastrar curinga amplo nem domínio de produção. Testes de e-mail ficam sujeitos ao limite HTTP 429 do Auth; não contornar.
