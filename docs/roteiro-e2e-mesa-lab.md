# Roteiro E2E da Mesa de Redação no LAB (pronto para executar após a autorização do banco)

Projeto LAB: `hmspabllgxqfzzricijv`. Nada aqui toca a Produção. **Não executar antes das portas abaixo.**

## Portas (todas obrigatórias)

1. **Autorização explícita do proprietário** para escrita no LAB.
2. Rodar `supabase/tests/lab-preflight-202611060005.sql` (somente leitura) e guardar a saída das seções 6, 7 e 8 (rollback). Conferir: dependências todas `true`, seção 10 com as colunas esperadas, `public.profiles` existente.
3. Aplicar, **uma por vez, cada uma precedida do dry-run** (`begin; … rollback;`), pelo canal que o proprietário aprovar, **nesta ordem**: `202611060002` (leitura; alimenta a tela do Owner), `202611060003`, `202611060005`. Sem `db push` indiscriminado e sem reparar histórico manualmente.
4. Validar: sonda anônima devolve 401 para `blog_access_level`, `admin_set_blog_access`, `admin_list_blog_events`, `admin_list_accounts`; contagem de contas `owner`/`admin` igual à anterior.
5. Preview do LAB rodando a `main` atual (`wind-theme-m2-lab-preview*.vercel.app`; a sessão Vercel do proprietário é a que abre o Preview protegido).

## Contas (somente sintéticas e comuns)

- `escritora.lab` e `editor.lab`: cadastro normal no site do LAB, e-mail de um domínio controlado pelo Instituto, senha escolhida por quem executa (nunca compartilhada). Sem `public.users`, sem papel global.
- Owner: a conta **já existente** do LAB. Não criar owner nem admin.
- Concessão: Owner em Central → **Usuários e acessos** → nível **Escritor** para `escritora.lab` e **Editor** para `editor.lab`.

## Passos e resultado esperado

| # | Quem | Ação | Esperado |
|---|---|---|---|
| 1 | Editor | Cria um rascunho "Texto do editor (sintético)" | Salvo como rascunho; invisível no Blog público |
| 2 | Escritora | Abre a Mesa | Lista só os próprios textos e os já publicados; **não vê** o rascunho do editor |
| 3 | Escritora | Abre um texto legado publicado e tenta salvar | Bloqueado (só altera texto de sua autoria) |
| 4 | Escritora | Novo texto: título, conteúdo, imagem, categoria; **Salvar rascunho**; pré-visualizar | Status Rascunho; autoria dela; invisível ao público |
| 5 | Escritora | **Enviar para revisão** | Status Em revisão; invisível ao público |
| 6 | Escritora | Tenta **Publicar**/destacar/arquivar | Bloqueado na tela e no banco |
| 7 | Editor | Abre a fila, revisa, **Publica** | Status Publicado |
| 8 | Visitante | `blog.html` do LAB e `escritor.html?nome=<assinatura da escritora>` | Texto aparece no Blog e na lista do perfil, com o autor correto |
| 9 | Editor | Tenta abrir Pessoas, Agendamentos, Salas, Financeiro e Usuários e acessos; tenta conceder acesso | Sem acesso a todos |
| 10 | Owner | Muda `escritora.lab` para **Sem acesso** | Na próxima ação da escritora na Mesa: bloqueada |
| 11 | Todos | Comparar os textos legados publicados antes e depois | Mesma contagem e mesmo conteúdo |
| 12 | Editor | Arquiva/remove o texto sintético; Owner revoga as duas contas | LAB como antes; contas `owner`/`admin` iguais |

## Evidências a guardar (aprovação)

Capturas de cada passo em desktop e 375 px, a saída das consultas de contagem (`public.users` por papel, `blog_posts` por status antes e depois) e o registro das versões aplicadas. Critério de PASS: **todos os 12 passos** com o resultado esperado e zero conta administrativa nova.

## Impedimentos conhecidos (estado em 14/11/2026)

- LAB sem 060002/060003/060005: o E2E não roda enquanto a porta 3 não for cumprida.
- Sem leitura direta do LAB nesta sessão (sem conexão Supabase com leitura disponível): a porta 2 precisa de quem tenha acesso de leitura.
- Nenhuma conta sintética criada ainda.
