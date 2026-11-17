/*
 * O banco do "Editar site" para o painel: chamadas às funções do Owner e envio de imagem.
 *
 * Não decide permissão nenhuma: o banco confere a conta Owner em cada chamada. Aqui só se traduz o erro do banco
 * numa frase que o Owner entende e num código que a tela usa para decidir o que oferecer.
 */
import { LIMITE_IMAGEM_BYTES, TIPOS_IMAGEM, validarArquivoImagem } from "./validar.js";

export const BUCKET_IMAGENS = "site-editor-media";

export class ErroEditarSite extends Error {
  constructor(codigo, mensagem, causa) {
    super(mensagem);
    this.name = "ErroEditarSite";
    this.codigo = codigo;
    this.causa = causa;
  }
}

const MENSAGENS = {
  SEM_PERMISSAO: "Somente a conta Owner pode editar o site.",
  CONFLITO: "Esta página foi alterada em outra aba ou janela.",
  NAO_ENCONTRADO: "Não encontramos essa versão ou esse rascunho.",
  INVALIDO: "O banco não aceitou esse conteúdo. Revise o texto, os links e as imagens.",
  REDE: "Sem conexão com o Portal. Suas alterações continuam na tela; tente de novo em instantes.",
  GERAL: "Não foi possível concluir. Suas alterações continuam na tela; tente de novo.",
};

export function traduzirErro(error) {
  if (error instanceof ErroEditarSite) return error;
  const codigo = String(error?.code || "");
  const texto = String(error?.message || "");
  if (codigo === "42501" || /Owner|permission denied|row-level security/i.test(texto)) return new ErroEditarSite("SEM_PERMISSAO", MENSAGENS.SEM_PERMISSAO, error);
  if (codigo === "PT409") return new ErroEditarSite("CONFLITO", texto || MENSAGENS.CONFLITO, error);
  if (codigo === "PT404") return new ErroEditarSite("NAO_ENCONTRADO", MENSAGENS.NAO_ENCONTRADO, error);
  if (codigo === "22023") return new ErroEditarSite("INVALIDO", texto || MENSAGENS.INVALIDO, error);
  if (/fetch|network|failed to|timeout|conex/i.test(texto) || error?.name === "TypeError") return new ErroEditarSite("REDE", MENSAGENS.REDE, error);
  return new ErroEditarSite("GERAL", MENSAGENS.GERAL, error);
}

export function criarApiEditarSite({ client } = {}) {
  if (!client?.rpc) throw new TypeError("O cliente do banco é obrigatório.");

  async function chamar(nome, args) {
    let resposta;
    try { resposta = await client.rpc(nome, args); } catch (error) { throw traduzirErro(error); }
    if (resposta?.error) throw traduzirErro(resposta.error);
    return resposta?.data ?? null;
  }

  return {
    carregar: (slug) => chamar("site_editor_load", { p_page: slug }),
    conteudoDaVersao: (slug, version) => chamar("site_revision_content", { p_page: slug, p_version: version }),
    salvarRascunho: (slug, content, revisaoEsperada) => chamar("site_save_draft", { p_page: slug, p_content: content, p_expected_revision: revisaoEsperada }),
    descartarRascunho: (slug, revisaoEsperada) => chamar("site_discard_draft", { p_page: slug, p_expected_revision: revisaoEsperada }),
    publicar: (slug, versaoEsperada, revisaoEsperada) => chamar("site_publish", { p_page: slug, p_expected_version: versaoEsperada, p_expected_revision: revisaoEsperada }),
    restaurar: (slug, version, versaoEsperada, descartarRascunho = false) => chamar("site_restore", {
      p_page: slug, p_version: version, p_expected_version: versaoEsperada, p_discard_draft: Boolean(descartarRascunho),
    }),
    /** Envia a imagem ao bucket do editor (só o Owner consegue) e devolve o endereço público. */
    async enviarImagem(slug, arquivo) {
      const erro = validarArquivoImagem(arquivo);
      if (erro) throw new ErroEditarSite("INVALIDO", erro);
      const extensao = TIPOS_IMAGEM[arquivo.type];
      const nome = `${slug}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${extensao}`;
      let resposta;
      try {
        resposta = await client.storage.from(BUCKET_IMAGENS).upload(nome, arquivo, { contentType: arquivo.type, upsert: false, cacheControl: "31536000" });
      } catch (error) { throw traduzirErro(error); }
      if (resposta?.error) throw traduzirErro(resposta.error);
      const { data } = client.storage.from(BUCKET_IMAGENS).getPublicUrl(nome);
      if (!data?.publicUrl) throw new ErroEditarSite("GERAL", MENSAGENS.GERAL);
      return data.publicUrl;
    },
    limiteImagemBytes: LIMITE_IMAGEM_BYTES,
  };
}
