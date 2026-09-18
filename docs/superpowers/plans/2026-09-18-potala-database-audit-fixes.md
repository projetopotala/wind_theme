# Plano de correções da auditoria de banco

> Executar em mudanças incrementais, começando por testes que falham e mantendo o visual existente.

## Objetivo

Eliminar a credencial paralela, reforçar integridade do Blog, tornar falhas persistentes observáveis e fornecer uma verificação remota reproduzível sem criar outro backend ou outras entidades.

## Etapa 1 — Testes para erros observáveis

**Arquivos:**
- Alterar `tests/potala/conta-rastro.test.mjs`
- Alterar `tests/potala/conta-sessao.test.mjs`
- Alterar `tests/potala/blog-remoto.test.mjs`
- Alterar/criar teste da mesa do blog conforme infraestrutura existente

1. Adicionar teste de callback quando a gravação do histórico falhar.
2. Adicionar teste de callback quando perfil ou recuperação da sessão falhar.
3. Adicionar teste de callback quando o contador de leitura falhar.
4. Provar que leitura/uso principal continua funcionando.

## Etapa 2 — Implementar observabilidade sem quebrar UX

**Arquivos:**
- Alterar `outputs/js/conta/rastro.js`
- Alterar `outputs/js/conta/sessao.js`
- Alterar `outputs/js/conta/conta.js`
- Alterar `outputs/js/blog/blog-remoto.js`
- Alterar `outputs/js/blog-admin/blog-desk.js`

1. Aceitar `aoFalhar` injetável, com `console.warn` controlado na composição.
2. Preservar fallback de leitura e não bloquear artigo/histórico.
3. Exibir indisponibilidade parcial de métricas/comentários no painel em vez de zerar silenciosamente.
4. Rodar os testes focados.

## Etapa 3 — Migration de segurança e integridade

**Arquivos:**
- Criar `supabase/migrations/202609180001_integridade_de_persistencia.sql`
- Alterar `README.md`
- Alterar testes de migration

1. Remover `verify_portal_password()` e `set_portal_user_password()`.
2. Remover `users.password_hash`; Supabase Auth permanece a única fonte de senha.
3. Adicionar FKs `NOT VALID` de comentários/visualizações para posts para proteger novas operações sem destruir eventual legado remoto.
4. Definir `ON UPDATE CASCADE` e `ON DELETE CASCADE` para auxiliares estritamente pertencentes ao post.
5. Documentar consulta de órfãos e validação posterior das constraints.
6. Atualizar o procedimento de criação de admin para Auth + `public.users`.

## Etapa 4 — Verificador remoto somente leitura

**Arquivos:**
- Criar `scripts/audit-supabase-public.mjs`
- Alterar `package.json`
- Criar teste unitário do verificador ou separar funções puras para teste

1. Ler URL e chave publicável da configuração atual sem imprimir a chave.
2. Verificar conteúdo público esperado.
3. Verificar negação de tabelas e RPCs privadas.
4. Sair com código diferente de zero se houver exposição.
5. Adicionar `npm run audit:database`.

## Etapa 5 — Verificação final

1. Executar testes focados.
2. Executar todos os testes de persistência/Supabase.
3. Executar `npm run audit:database` contra o projeto remoto.
4. Executar `npm run test:portal` e comparar com baseline de 6 falhas visuais preexistentes.
5. Revisar o diff para garantir que nenhum visual ou fluxo fora do escopo foi alterado.
6. Atualizar o relatório com correções, evidências, pendências e checklist honesta.
