# Marco 2 — integração local de homologação

Branch isolada: `codex/m2-integrated-lab-preview`, criada de `feat/m2-frente-c-agendamentos` (`32ab56f`) e integrada por merges locais com `feat/p4-1-formularios-participacao` e `feat/m2-t01-auth-meu-potala` (`94ef291`). A Frente B é ancestral do commit da Frente C; T-01 foi integrada explicitamente no merge `d3d200c`. Nenhuma branch de origem ou `main` foi modificada.

`outputs/js/supabase/config.js` usa somente a URL `https://hmspabllgxqfzzricijv.supabase.co` e a chave publicável desse laboratório. Não há referência ao Project ID de produção nos módulos JS do frontend. `siteUrl` usa a origem da própria preview no navegador; a URL pública de homologação e o redirect permitido no Supabase Auth ainda precisam ser definidos antes de testar confirmação de conta em outro dispositivo.

Validação local da integração: `npm run test:portal` 1285/1285 PASS; `npm run lint`, `npm run build` e `npm run validate:portal` PASS. O build não publica o site. A tentativa de abrir `http://127.0.0.1:4173/meu-potala/atendimentos` no Chrome expirou apesar de o servidor local iniciar; nenhum teste visual de navegador foi marcado como PASS.

P4.1 no laboratório: `site_interests.submission_key` e a RPC idempotente estão presentes. `node scripts/run-p4-1-lab.mjs` concluiu 26/26 verificações HTTP reais PASS com marcador `p4-1-1793318597361-1044ae`, incluindo concorrência, acesso administrativo, RLS, newsletter e moderação. O runner foi ajustado nesta branch para exigir correspondência exata da URL do laboratório.

Próximos gates: criar uma preview em projeto Vercel separado e configurar o redirect Auth do laboratório para essa origem. O formulário público de agendamento, o painel administrativo e as reservas permanecem desativados em `outputs/js/appointments/config.js`; a site key do Turnstile está vazia. Essas condições impedem marcar a jornada visual completa como homologada. Não publicar, fazer push ou merge em `main` automaticamente.
