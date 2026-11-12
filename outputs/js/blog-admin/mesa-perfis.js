/*
 * PERFIS DOS ESCRITORES NA MESA (P2B) - seção de Configurações.
 *
 * Lista quem assina os textos (pelas assinaturas que a mesa já leu) e os perfis já
 * cadastrados, e deixa quem publica editar nome público, apresentação, imagem e
 * visibilidade. O endereço do perfil é o mesmo da página pública (P2A) e nunca muda.
 *
 * Permissão: só quem publica (Editor/Owner) vê os controles. O banco decide de
 * novo a cada gravação; esconder o botão é conforto, não segurança.
 */
import { icone } from "../admin/icones.js";
import { ASSINATURA_INSTITUCIONAL, LIMITES_DO_PERFIL, comoPerfil, iniciaisDoEscritor, imagemDePerfilSegura, slugDoEscritor } from "../blog/escritores.js";
import { esc, enderecoDoSite } from "./mesa-ui.js";
import { podePublicar } from "./mesa-modelo.js";

const i = (nome) => icone(nome, { classe: "mesa-icone" });
const contagem = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/* Assinaturas dos textos + perfis cadastrados, um item por endereço. */
export function escritoresDaMesa(registros = [], perfis = []) {
  const mapa = new Map();
  for (const registro of registros) {
    const post = registro?.post;
    if (!post) continue;
    const assinatura = String(post.author || "").trim() || ASSINATURA_INSTITUCIONAL;
    const slug = slugDoEscritor(assinatura);
    const item = mapa.get(slug) || { slug, assinatura, textos: 0, publicados: 0, perfil: null };
    item.textos += 1;
    if (registro.status === "published") item.publicados += 1;
    mapa.set(slug, item);
  }
  for (const perfil of perfis) {
    const item = mapa.get(perfil.slug) || { slug: perfil.slug, assinatura: perfil.nome, textos: 0, publicados: 0, perfil: null };
    item.perfil = perfil;
    mapa.set(perfil.slug, item);
  }
  const nome = (item) => item.perfil?.nome || item.assinatura;
  return [...mapa.values()].sort((a, b) => nome(a).localeCompare(nome(b), "pt-BR"));
}

const situacao = (item) => (!item.perfil ? "sem perfil" : item.perfil.visivel === false ? "perfil oculto" : "perfil publicado");

function avatar(nome, imagem) {
  const segura = imagemDePerfilSegura(imagem);
  return segura
    ? `<span class="mesa-escritor__foto"><img src="${esc(enderecoDoSite(segura))}" alt=""></span>`
    : `<span class="mesa-escritor__foto mesa-escritor__foto--iniciais" aria-hidden="true">${esc(iniciaisDoEscritor(nome))}</span>`;
}

function formulario(item, rascunho) {
  const p = rascunho;
  return `<form class="mesa-escritor__form" data-perfil-form="${esc(item.slug)}">
    <p class="mesa-dica">Endereço público: <a href="/escritor.html?nome=${esc(item.slug)}" target="_blank" rel="noopener">/escritor.html?nome=${esc(item.slug)}</a>. Ele vem da assinatura dos textos e não muda.</p>
    <label class="mesa-campo"><span>Nome público</span><input name="nome" required maxlength="${LIMITES_DO_PERFIL.nome}" value="${esc(p.nome)}"></label>
    <label class="mesa-campo"><span>Apresentação <small>opcional</small></span>
      <textarea name="bio" rows="6" maxlength="${LIMITES_DO_PERFIL.bio}" placeholder="Quem é, o que pesquisa, o que escreve no Caderno. Deixe uma linha em branco entre parágrafos.">${esc(p.bio)}</textarea></label>
    <div class="mesa-campo"><span>Imagem <small>opcional</small></span>
      <div class="mesa-linha mesa-escritor__imagem">${avatar(p.nome || item.assinatura, p.imagem)}
        <button type="button" class="mesa-botao mesa-botao--contorno" data-perfil-imagem>${i("image")}${p.imagem ? "Trocar imagem" : "Escolher imagem"}</button>
        ${p.imagem ? `<button type="button" class="mesa-botao mesa-botao--fantasma" data-perfil-sem-imagem>Remover imagem</button>` : ""}
      </div></div>
    ${p.imagem ? `<label class="mesa-campo"><span>Descrição da imagem <small>para leitores de tela</small></span><input name="imagemAlt" maxlength="${LIMITES_DO_PERFIL.alt}" value="${esc(p.imagemAlt)}"></label>` : ""}
    <label class="mesa-escritor__visivel"><input type="checkbox" name="visivel" ${p.visivel === false ? "" : "checked"}> Mostrar o perfil na página pública</label>
    <div class="mesa-linha mesa-linha--fim">
      <button type="button" class="mesa-botao mesa-botao--fantasma" data-perfil-cancelar>Cancelar</button>
      <button type="submit" class="mesa-botao mesa-botao--principal">${i("check")}Salvar perfil</button>
    </div>
  </form>`;
}

export function htmlDosPerfis({ permissoes, estado, itens = [], aberto = "", rascunho = null, busca = "", erro = "" } = {}) {
  const cabeca = `<h2 id="config-escritores" class="mesa-subtitulo">Escritores</h2>
    <p class="mesa-dica">Nome, apresentação e imagem que aparecem na página pública de cada escritor. Os textos não mudam; a assinatura de cada texto continua sendo editada no próprio texto.</p>`;
  if (!podePublicar(permissoes)) return `${cabeca}<p class="mesa-dica">Só quem publica no Blog edita os perfis dos escritores.</p>`;
  if (estado === "carregando") return `${cabeca}<p class="mesa-dica" role="status">Carregando os perfis…</p>`;
  if (estado === "erro") {
    return `${cabeca}<div class="mesa-vazio" role="alert">${i("triangle-alert")}<p>${esc(erro || "Não foi possível ler os perfis agora.")}</p>
      <button type="button" class="mesa-botao mesa-botao--contorno" data-perfil-recarregar>${i("rotate-ccw")}Tentar de novo</button></div>`;
  }
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const visiveis = termo ? itens.filter((item) => `${item.perfil?.nome || ""} ${item.assinatura}`.toLocaleLowerCase("pt-BR").includes(termo)) : itens;
  const linhas = visiveis.map((item) => {
    const nome = item.perfil?.nome || item.assinatura;
    const editando = item.slug === aberto;
    return `<li data-perfil="${esc(item.slug)}"${editando ? ' class="is-aberto"' : ""}>
      <div class="mesa-escritor">${avatar(nome, item.perfil?.imagem)}
        <span class="mesa-escritor__nome"><strong>${esc(nome)}</strong><small>${esc(contagem(item.publicados, "texto publicado", "textos publicados"))} · ${esc(situacao(item))}</small></span>
        <span class="mesa-escritor__acoes">
          ${item.publicados || item.perfil?.visivel ? `<a class="mesa-botao-icone" href="/escritor.html?nome=${esc(item.slug)}" target="_blank" rel="noopener" aria-label="Ver a página pública de ${esc(nome)}">${i("external-link")}</a>` : ""}
          <button type="button" class="mesa-botao mesa-botao--contorno" data-perfil-editar aria-expanded="${editando}">${i("pencil")}${item.perfil ? "Editar" : "Criar perfil"}</button>
        </span></div>
      ${editando ? formulario(item, rascunho) : ""}
    </li>`;
  }).join("");
  return `${cabeca}
    <label class="mesa-campo mesa-campo--linha mesa-escritores__busca"><span class="sr-only">Localizar escritor</span><input type="search" placeholder="Localizar escritor" value="${esc(busca)}" data-perfil-busca></label>
    ${visiveis.length ? `<ul class="mesa-escritores">${linhas}</ul>` : `<p class="mesa-dica">${itens.length ? "Nenhum escritor com esse nome." : "Ainda não há textos assinados."}</p>`}`;
}

/* A seção viva: carrega, abre/fecha o formulário, salva. Desenha só dentro de `alvo()`. */
export function criarPerfisDosEscritores(ctx, alvo) {
  let estado = "carregando";
  let perfis = [];
  let erro = "";
  let aberto = "";
  let rascunho = null;
  let busca = "";
  let salvando = false;
  let carregado = false;
  let permissoesVistas = null;

  const itens = () => escritoresDaMesa(ctx.loja.registros, perfis);
  const desenhar = () => {
    const el = alvo();
    if (el) el.innerHTML = htmlDosPerfis({ permissoes: ctx.permissoes, estado, itens: itens(), aberto, rascunho, busca, erro });
  };
  async function carregar() {
    if (!podePublicar(ctx.permissoes)) { desenhar(); return; }
    estado = "carregando"; desenhar();
    try {
      perfis = await ctx.repositorio.listarPerfis();
      estado = "pronto";
    } catch (falha) {
      estado = "erro";
      erro = falha?.code === "PGRST205" || /blog_writer_profiles/.test(falha?.message || "")
        ? "Os perfis dos escritores ainda não estão disponíveis neste ambiente."
        : falha?.message || "";
    }
    carregado = true;
    desenhar();
  }
  const lerFormulario = (form) => ({
    ...rascunho,
    nome: form.elements.nome.value,
    bio: form.elements.bio.value,
    imagemAlt: form.elements.imagemAlt?.value ?? rascunho.imagemAlt,
    visivel: form.elements.visivel.checked,
  });

  function ligar(el) {
    el.addEventListener("input", (evento) => {
      if (!evento.target.matches("[data-perfil-busca]")) return;
      busca = evento.target.value;
      const cursor = evento.target.selectionStart;
      desenhar();
      const campo = alvo()?.querySelector("[data-perfil-busca]");
      campo?.focus(); campo?.setSelectionRange(cursor, cursor);
    });
    el.addEventListener("click", async (evento) => {
      if (!alvo()?.contains(evento.target)) return;
      if (evento.target.closest("[data-perfil-recarregar]")) { await carregar(); return; }
      const linha = evento.target.closest("[data-perfil]");
      if (!linha) return;
      const item = itens().find((x) => x.slug === linha.dataset.perfil);
      if (!item) return;
      if (evento.target.closest("[data-perfil-editar]")) {
        if (aberto === item.slug) { aberto = ""; rascunho = null; desenhar(); return; }
        aberto = item.slug;
        rascunho = item.perfil ? { ...item.perfil } : { slug: item.slug, nome: item.assinatura, bio: "", imagem: "", imagemAlt: "", visivel: true };
        desenhar();
        alvo()?.querySelector(`[data-perfil-form] input[name="nome"]`)?.focus();
        return;
      }
      const form = linha.querySelector("[data-perfil-form]");
      if (evento.target.closest("[data-perfil-cancelar]")) { aberto = ""; rascunho = null; desenhar(); return; }
      if (evento.target.closest("[data-perfil-sem-imagem]")) { rascunho = { ...lerFormulario(form), imagem: "", imagemAlt: "" }; desenhar(); return; }
      if (evento.target.closest("[data-perfil-imagem]")) {
        const atual = lerFormulario(form);
        const escolha = await ctx.biblioteca.escolher({ titulo: `Imagem de “${atual.nome || item.assinatura}”`, atual: atual.imagem });
        if (!escolha?.[0]) return;
        if (!imagemDePerfilSegura(escolha[0])) { ctx.avisos.mostrar("Use uma imagem da biblioteca do Blog ou do site.", { tipo: "erro" }); return; }
        rascunho = { ...atual, imagem: escolha[0] };
        desenhar();
      }
    });
    el.addEventListener("submit", async (evento) => {
      const form = evento.target.closest("[data-perfil-form]");
      if (!form) return;
      evento.preventDefault();
      if (salvando) return;
      const dados = lerFormulario(form);
      if (!comoPerfil({ ...dados, slug: aberto })) { ctx.avisos.mostrar("Dê um nome público ao perfil.", { tipo: "erro" }); return; }
      salvando = true;
      form.querySelector('[type="submit"]').disabled = true;
      const existe = perfis.some((p) => p.slug === aberto);
      try {
        const salvo = await ctx.repositorio.salvarPerfil({ ...dados, slug: aberto }, { existe });
        perfis = [...perfis.filter((p) => p.slug !== salvo.slug), salvo];
        aberto = ""; rascunho = null;
        desenhar();
        ctx.avisos.mostrar(salvo.visivel === false ? "Perfil salvo e oculto da página pública." : "Perfil salvo. A página do escritor já mostra a apresentação nova.");
      } catch (falha) {
        rascunho = dados;
        ctx.avisos.mostrar(`Não foi possível salvar: ${falha.message}`, { tipo: "erro" });
        desenhar();
      } finally {
        salvando = false;
      }
    });
  }

  return {
    /* Chamado a cada desenho de Configurações: carrega uma vez, depois só redesenha. */
    desenhar() {
      // Outra conta (ou outras permissões) na mesma Mesa: nada da sessão anterior é reaproveitado.
      if (permissoesVistas !== ctx.permissoes) { permissoesVistas = ctx.permissoes; carregado = false; perfis = []; aberto = ""; rascunho = null; estado = "carregando"; }
      if (!carregado) void carregar(); else desenhar();
    },
    recarregar: carregar,
    ligar,
  };
}
