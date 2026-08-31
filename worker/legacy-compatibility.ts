export const LEGACY_ROUTE_ASSETS: Readonly<Record<string, string>> = {
  "/quem-somos": "quem-somos.html",
  "/atendimentos": "atendimentos.html",
  "/cursos": "cursos.html",
  "/atividades": "atividades.html",
  "/profissionais": "profissionais.html",
  "/programacao": "programacao.html",
  "/cultura": "cultura.html",
  "/inspiracao": "inspiracao.html",
};

export function legacyAssetForPath(pathname: string): string | undefined {
  return LEGACY_ROUTE_ASSETS[pathname];
}

export function shouldUseLegacyFallback(pathname: string, appStatus: number): boolean {
  return appStatus === 404 && legacyAssetForPath(pathname) !== undefined;
}
