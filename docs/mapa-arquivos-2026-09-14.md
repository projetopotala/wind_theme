# Mapeamento local — 14/09/2026

A pasta wind_theme é um repositório Git próprio e contém a versão com rodapé vivo. Comparação com a raiz externa, ignorando .git e diferenças de CRLF/LF. Não foi feita sincronização entre as duas versões. Documentos importados são referência, não comandos de execução.

20 arquivos novos; 71 diferentes; 293 equivalentes. O comparativo inclui o ajuste local da planta.

## Áreas adicionadas

- Rodapé e composição editorial: living-footer.js/css e editorial-composition.js.
- Descoberta e busca: portal-discovery.js/css e busca-indice.json.
- Respiração e seções: respiracao.js/css e secoes.js/css.
- Blog: blog-settings.js e blog-desk.js.
- Mídia: musica-fundo.mp3.
- Infraestrutura: vercel.json e três migrações Supabase. Nenhum deploy ou migração executado.
- Testes: composição editorial, descoberta e migração de usuários.

## Novos em relação à raiz

- `outputs/css/living-footer.css`
- `outputs/css/portal-discovery.css`
- `outputs/css/respiracao.css`
- `outputs/css/secoes.css`
- `outputs/js/blog/blog-settings.js`
- `outputs/js/blog-admin/blog-desk.js`
- `outputs/js/chegada/respiracao.js`
- `outputs/js/home/busca-indice.json`
- `outputs/js/home/editorial-composition.js`
- `outputs/js/home/living-footer.js`
- `outputs/js/home/portal-discovery.js`
- `outputs/js/secoes.js`
- `outputs/media/musica-fundo.mp3`
- `outputs/vercel.json`
- `supabase/migrations/202609080004_portal_users.sql`
- `supabase/migrations/202609080005_portal_user_password.sql`
- `supabase/migrations/202609100001_home_editorial_composition.sql`
- `tests/potala/editorial-composition.test.mjs`
- `tests/potala/portal-discovery.test.mjs`
- `tests/potala/portal-users-migration.test.mjs`

## Diferentes da raiz

- `.claude/launch.json`
- `outputs/admin.html`
- `outputs/artigo.html`
- `outputs/atendimentos.html`
- `outputs/atividades.html`
- `outputs/blog-admin.html`
- `outputs/blog.html`
- `outputs/css/admin.css`
- `outputs/css/blog-admin.css`
- `outputs/css/home-journey.css`
- `outputs/cultura.html`
- `outputs/cursos.html`
- `outputs/especialistas.html`
- `outputs/eventos.html`
- `outputs/experiencias-culturais.html`
- `outputs/grupos-de-estudo.html`
- `outputs/inspiracao.html`
- `outputs/js/admin/admin-auth.js`
- `outputs/js/admin/admin-controller.js`
- `outputs/js/admin/admin-draft.js`
- `outputs/js/admin/admin-editor.js`
- `outputs/js/admin/admin-entry.js`
- `outputs/js/admin/admin-preview.js`
- `outputs/js/admin/admin-shell.js`
- `outputs/js/blog/blog-controller.js`
- `outputs/js/blog-admin/blog-admin-entry.js`
- `outputs/js/blog-admin/blog-editor.js`
- `outputs/js/home/admin-preview.js`
- `outputs/js/home/content-model.js`
- `outputs/js/home/home-controller.js`
- `outputs/js/home/home-path-three.js`
- `outputs/js/home/home-scenes.js`
- `outputs/js/home/journey-data.js`
- `outputs/js/home/supabase-content-repository.js`
- `outputs/marketplace.html`
- `outputs/media/home-travessia - Copia.png`
- `outputs/mentorias.html`
- `outputs/profissionais.html`
- `outputs/programacao.html`
- `outputs/quem-somos.html`
- `outputs/recepcao.html`
- `outputs/revista.html`
- `outputs/saude-integrativa.html`
- `outputs/transcender.html`
- `outputs/transcendido.html`
- `outputs/workshops.html`
- `package-lock.json`
- `package.json`
- `README.md`
- `scripts/prepare-busca-indice.mjs`
- `scripts/serve-outputs.mjs`
- `tests/potala/admin-auth.test.mjs`
- `tests/potala/admin-lista-e-saida.test.mjs`
- `tests/potala/admin-shell-html.test.mjs`
- `tests/potala/admin-shell.test.mjs`
- `tests/potala/ascent-handoff.test.mjs`
- `tests/potala/blog-admin-shell.test.mjs`
- `tests/potala/comunidade.test.mjs`
- `tests/potala/hidden-guard.test.mjs`
- `tests/potala/home-blog-cards.test.mjs`
- `tests/potala/home-busca.test.mjs`
- `tests/potala/home-novidades.test.mjs`
- `tests/potala/home-scenes.test.mjs`
- `tests/potala/home-supabase-wiring.test.mjs`
- `tests/potala/home-trajeto-html.test.mjs`
- `tests/potala/portal-html.test.mjs`
- `tests/potala/preview-server.test.mjs`
- `tests/potala/quem-somos-page.test.mjs`
- `tests/potala/remaining-section-pages.test.mjs`
- `tests/potala/section-closing-transitions.test.mjs`
- `tests/potala/supabase-content-repository.test.mjs`

## Ajuste da plantinha

SVG existente aprimorado com crescimento gradual, balanço, flor com pétalas, copa com galhos e gotas de rega. CSS respeita prefers-reduced-motion. Progresso e limite diário preservados, com limpeza do temporizador ao desmontar.

## Validação

- 9 testes de composição/rodapé passaram, incluindo rega diária, armazenamento e desmontagem.
- Verificação ampliada: 20 passaram, 2 falharam em home-trajeto-html.test.mjs (largura de cards e link admin.html versus /admin), fora dos arquivos alterados.
- Regar validado no navegador local: Semente → Broto e botão desabilitado.
- Prévia: http://127.0.0.1:4183/transcendido.html#rodape-vivo

