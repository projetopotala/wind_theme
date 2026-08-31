type Disposable = { dispose(): void };
type RendererLike = Disposable & {
  forceContextLoss?: () => void;
  domElement?: { remove?: () => void };
};

export function disposeThreeEnvironment({
  geometry,
  material,
  resources = [],
  renderer,
}: {
  geometry?: Disposable;
  material?: Disposable;
  resources?: readonly Disposable[];
  renderer: RendererLike;
}) {
  const disposableResources = [...resources, geometry, material].filter((resource): resource is Disposable => Boolean(resource));
  disposableResources.forEach((resource) => resource.dispose());
  renderer.dispose();
  renderer.forceContextLoss?.();
  renderer.domElement?.remove?.();
}
