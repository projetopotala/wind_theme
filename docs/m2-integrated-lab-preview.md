# Marco 2 — integração local de homologação

Branch isolada: `codex/m2-integrated-lab-preview`, criada de `feat/m2-frente-c-agendamentos` (`32ab56f`) e integrada por merge local com `feat/p4-1-formularios-participacao`. As Frentes B e T-01 já são ancestrais do commit da Frente C. Nenhuma branch de origem ou `main` foi modificada.

`outputs/js/supabase/config.js` usa somente a URL `https://hmspabllgxqfzzricijv.supabase.co` e a chave publicável desse laboratório. Não há referência ao Project ID de produção nos módulos JS do frontend. `siteUrl` usa a origem da própria preview no navegador; a URL pública de homologação e o redirect permitido no Supabase Auth ainda precisam ser definidos antes de testar confirmação de conta em outro dispositivo.

Validação local da integração: `npm run test:portal` 1285/1285 PASS; `npm run lint`, `npm run build` e `npm run validate:portal` PASS. O build não publica o site. A tentativa de abrir `http://127.0.0.1:4173/meu-potala/atendimentos` no Chrome expirou apesar de o servidor local iniciar; nenhum teste visual de navegador foi marcado como PASS.

P4.1 no laboratório: `site_interests.submission_key` e a RPC idempotente estão presentes. `node scripts/run-p4-1-lab.mjs` concluiu 26/26 verificações HTTP reais PASS com marcador `p4-1-1793318597361-1044ae`, incluindo concorrência, acesso administrativo, RLS, newsletter e moderação. O runner foi ajustado nesta branch para exigir correspondência exata da URL do laboratório.

Próximos gates: verificar a migration P4.1 no laboratório e executar seu runner HTTP real no estado integrado; tornar uma preview isolada acessível ao navegador e configurar o redirect Auth para essa origem. Não publicar, fazer push ou merge em `main` automaticamente.
