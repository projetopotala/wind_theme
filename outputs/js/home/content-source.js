/**
 * Compatibilidade durante a migração: o remoto é a verdade; o snapshot local
 * só evita que a Home pública fique vazia quando a leitura remota falha.
 * Escritas nunca caem para o navegador, pois isso anunciaria uma publicação
 * que nenhum outro visitante receberia.
 */
export function createHomeContentSource({
  remote,
  fallback,
  onRemoteError = () => {},
} = {}) {
  if (!remote?.list || !remote?.replaceAll || !remote?.reset) {
    throw new TypeError("O repositório remoto é obrigatório.");
  }
  if (!fallback?.list) throw new TypeError("O snapshot de fallback é obrigatório.");

  return {
    async list(options) {
      try {
        return await remote.list(options);
      } catch (error) {
        onRemoteError(error);
        return fallback.list(options);
      }
    },
    replaceAll(blocks) {
      return remote.replaceAll(blocks);
    },
    reset() {
      return remote.reset();
    },
  };
}
