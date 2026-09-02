# Páginas editoriais do Portal Potala — Design

## Objetivo

Transformar as páginas internas restantes do Portal Potala em experiências
editoriais completas, reutilizando e variando os três modelos já aprovados em
Quem Somos, Recepção e Atendimentos. A implementação será exclusivamente
front-end e local nesta etapa.

## Escopo

### Páginas existentes que serão redesenhadas

- `cursos.html`
- `atividades.html`
- `profissionais.html`
- `programacao.html`
- `cultura.html`
- `inspiracao.html`
- `marketplace.html`
- `saude-integrativa.html`

### Fora do escopo

- Banco de dados, Supabase, autenticação e painel administrativo.
- Busca real, recomendações por IA, agenda persistente e formulários enviados.
- Catálogo completo de cursos, profissionais, produtos ou eventos.
- Criação de Blog, Revista, Para Empresas, Trabalhe Conosco ou outras páginas.
- Alterações na Chegada, Home, estrada, respiração e som.

Recursos ainda sem backend aparecerão como interfaces demonstrativas claras,
sem simular salvamento ou automações que não existem.

## Fontes editoriais

O conteúdo será resumido a partir de `Ecossistema Digital Potala.docx` e
conferido contra as páginas públicas do Instituto Potala. A cópia manterá a
proposta do documento: apresentar cada universo, orientar a descoberta e criar
conexões, sem transformar as páginas em catálogos extensos.

Informações temporais — datas, preços, disponibilidade e profissionais em
atividade — não serão fixadas localmente. Esses dados apontarão para a página
oficial correspondente quando necessário.

## Sistema visual

As páginas compartilham a paleta terrosa, tipografia editorial, navegação de
retorno à Home, rodapé e comportamento de entrada. Cada uma, porém, terá ritmo
próprio. Os três modelos funcionam como famílias, não como templates copiados.

### Modelo A — narrativa editorial

Derivado de Quem Somos. Usa abertura ampla, capítulos conceituais, números ou
marcos, frases grandes e uma conclusão contemplativa.

Aplicação:

- Cursos: conhecimento, formatos de aprendizagem, prática e "Monte seu curso".
- Arte e Cultura: encontros, biblioteca, cinema, música e convivência.

### Modelo B — orientação interativa

Derivado da Recepção. Usa uma abertura de alto contraste, escolhas guiadas,
listas de caminhos e pequenos controles demonstrativos que funcionam sem
backend.

Aplicação:

- Programação: hoje, atividades permanentes, inscrições e agenda oficial.
- Inspiração: pausa, frase, respiração breve, música e mensagem contemplativa.

### Modelo C — encontro fotográfico

Derivado de Atendimentos. Usa uma imagem humana dominante, texto em coluna,
listas editoriais e alternância entre áreas claras e escuras.

Aplicação:

- Atividades: corpo, expressão, convivência e aula experimental.
- Profissionais: pessoas, trajetórias e modos de encontrar afinidades.
- Saúde Integrativa: pessoa inteira, tradições de cuidado e complementaridade.
- Marketplace: objetos como extensão contextual da prática, sem venda agressiva.

## Estrutura mínima de cada página

Cada página terá:

1. Abertura com título, frase editorial e imagem ou composição própria.
2. Dois a quatro momentos de conteúdo com densidades diferentes.
3. Um bloco que explica como explorar aquela área.
4. Conexões com pelo menos duas outras páginas do Ecossistema.
5. Link para a fonte oficial quando o conteúdo exigir atualização.
6. Encerramento com retorno à Travessia.

## Imagens

Imagens existentes serão reutilizadas quando forem humanas, coerentes e tiverem
resolução suficiente. Serão criadas novas imagens somente quando uma página não
tiver material adequado. Todas deverão evitar texto, logotipos, símbolos
espirituais genéricos e aparência artificial de banco de imagens.

## Interação

- Entradas por rolagem serão suaves e discretas.
- Controles demonstrativos responderão no navegador, mas declararão quando a
  função completa depender de uma etapa futura.
- Nenhuma animação será necessária para compreender o conteúdo.
- `prefers-reduced-motion` substituirá movimento por estados estáticos.
- Navegação, foco, contraste e textos alternativos serão preservados.

## Responsividade

No desktop, os modelos poderão alternar colunas, imagens e assimetria. No
mobile, o conteúdo ficará em uma coluna, com a imagem antes do texto quando ela
introduzir a narrativa. Tipografia fluida terá limites explícitos para impedir
cortes e sobreposições.

## Organização do código

- Cada página terá HTML próprio em `outputs/`.
- As três famílias terão folhas compartilhadas em `outputs/css/`, evitando oito
  cópias do mesmo sistema visual.
- Uma folha pequena por página só será criada quando houver uma composição que
  não pertença à família.
- Comportamentos compartilhados continuarão em `outputs/secoes.js`.
- Interações específicas ficarão em módulos pequenos de `outputs/js/sections/`.
- Novas imagens ficarão em `outputs/media/` em WebP otimizado.

## Integração com a Home

Os oito destinos existentes da Home continuarão funcionando sem alterar a
estrutura da estrada ou criar novas seções principais.

## Validação

- Testes estruturais para todas as páginas e links internos.
- Testes específicos das três famílias visuais e dos estados mobile.
- Validação de assets e ausência de caminhos quebrados.
- Lint e suíte completa do Portal.
- Revisão visual local em desktop e mobile, incluindo textos cortados,
  sobreposições, foco e reduced motion.

## Critério de conclusão

O trabalho termina quando as oito páginas restantes estiverem visualmente
integradas ao Portal, variadas entre as três famílias, conectadas à Home e entre
si, responsivas e verificadas localmente. Nenhuma alteração será enviada ao Git
nem integrada ao banco de dados nesta etapa.
