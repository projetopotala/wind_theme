# Domínio canônico, SEO e páginas legais

## Estado atual (provisório)

- Origem canônica provisória: `https://wind-theme.vercel.app` (único host oficial em
  `HOSTS_OFICIAIS`, `outputs/js/supabase/ambiente.js`).
- `https://www.institutopotala.com` **não** é usado em `canonical`, JSON-LD, `sitemap.xml` nem
  `robots.txt` até haver confirmação e migração oficial. Links externos editoriais para o site
  atual do Instituto (por exemplo, páginas de terapias) continuam como estavam.
- `canonical`, JSON-LD, `sitemap.xml` e `robots.txt` são gerados por `npm run build:legal-seo`
  a partir de uma única constante (`ORIGEM_CANONICA_PROVISORIA`).

## Garantias do gerador (`scripts/build-legal-seo.mjs`)

- Não reescreve o `vercel.json`: preserva `buildCommand`, `outputDirectory` e os rewrites existentes
  e só acrescenta rewrites que faltam. Sem `buildCommand`/`outputDirectory` ele aborta sem escrever nada.
- A origem precisa estar em `HOSTS_OFICIAIS`; outro domínio é recusado.
- Sitemap: apenas páginas públicas que existem em `outputs/`, sem `noindex`, sem páginas legais
  incompletas e sem áreas privadas.
- Áreas privadas (`admin`, `blog-admin`, `meu-potala`, `confirmar-conta`) usam `meta robots noindex` e
  **não** entram em `Disallow`: bloqueá-las no `robots.txt` impediria o robô de ler o `noindex`.
- Não habilita nenhuma ferramenta de rastreamento. `analytics-gate.js` só carrega um script se houver
  consentimento **e** `POTALA_ANALYTICS = { approved: true, src }` definido por quem aprovar o provedor.

## Blog

Na produção, /blog e /blog/ são rewrites para log-admin.html (editor, privado, oindex).
O blog público é /blog.html: seu canonical é fixo nesse caminho (CANONICO_FIXO no gerador), ele entra no
sitemap e o gerador aborta se algum canonical público apontar para uma rota administrativa.
Previsões da Vercel (deployments de Preview) já respondem X-Robots-Tag: noindex e não precisam de regra aqui.

## Páginas legais

As quatro rotas (`termos-de-uso`, `politica-de-privacidade`, `politica-de-cookies`,
`politica-de-compra-troca-cancelamento`) são marcadores identificados como "Conteúdo jurídico
aguardando aprovação", com `noindex` e fora do sitemap. Quando o Instituto aprovar um texto:
substituir o conteúdo da página e incluir o slug em `LEGAIS_APROVADOS` no script
(isso remove o `noindex` e coloca a página no sitemap).

## Troca futura para o domínio próprio

1. Confirmar o domínio com o Instituto e concluir a migração DNS/Vercel.
2. Autorizar o host em `HOSTS_OFICIAIS` (`ambiente.js`), com testes de ambiente atualizados, e ajustar
   Site URL e Redirect URLs do Supabase Auth (sem isso o login quebra).
3. Rodar `POTALA_ORIGEM_CANONICA=https://<dominio> npm run build:legal-seo` e atualizar
   `ORIGEM_CANONICA_PROVISORIA` e os testes de SEO.
4. Definir o mapa de redirecionamentos de URLs antigas (hoje não há `redirects`).
5. Reenviar o sitemap nos buscadores e manter o domínio antigo apontando para o novo.
