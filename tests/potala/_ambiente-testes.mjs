// Pré-carregado pelos scripts de teste (node --import). Fora do navegador o ambiente
// nunca é presumido: a suíte declara explicitamente que roda como o domínio oficial.
process.env.POTALA_AMBIENTE_ORIGEM ??= "https://wind-theme.vercel.app";
