export function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Não foi possível carregar ${source}`));
    image.src = source;
  });
}

export function loadOptionalImage(source) {
  if (!source) return Promise.resolve(null);
  return loadImage(source).catch(() => null);
}

export function matchesPlate(image, plate) {
  if (!image || !plate) return false;
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  return width === plate.width && height === plate.height;
}

export function createTexture(gl, image, unit) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
  return texture;
}

export function createEmptyTexture(gl, unit) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGB,
    1,
    1,
    0,
    gl.RGB,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0]),
  );
  return texture;
}

const TEXTURE_SLOTS = [
  { key: "image", name: "master", unit: 0, required: true, urlKey: "imageUrl" },
  { key: "depth", name: "depth", unit: 1, required: true, urlKey: "depthUrl" },
  { key: "waterMask", name: "water", unit: 2, required: false, urlKey: "waterMaskUrl" },
  { key: "canopyMask", name: "canopy", unit: 3, required: false, urlKey: "canopyMaskUrl" },
  { key: "mistMask", name: "mist", unit: 4, required: false, urlKey: "mistMaskUrl" },
  { key: "waterfallMask", name: "waterfall", unit: 5, required: false, urlKey: "waterfallMaskUrl" },
  { key: "skyMask", name: "sky", unit: 6, required: false, urlKey: "skyMaskUrl" },
];

export function arrivalTexturePriority() {
  return TEXTURE_SLOTS.map((slot) => slot.name);
}

export async function loadArrivalTextures({ gl, assets, debug = false } = {}) {
  const maxUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
  const usable = TEXTURE_SLOTS.filter((slot) => slot.unit < maxUnits);
  const dropped = TEXTURE_SLOTS.filter((slot) => slot.unit >= maxUnits);
  if (dropped.length && debug) {
    console.warn("Chegada: unidades de textura insuficientes", dropped.map((slot) => slot.name));
  }

  const loaded = {};
  const flags = {};
  const textures = [];
  let masterSize = null;

  for (const slot of usable) {
    const url = assets?.[slot.urlKey] || "";
    let image = null;
    if (slot.required) image = await loadImage(url);
    else image = await loadOptionalImage(url);

    if (slot.required && image && !masterSize) {
      masterSize = {
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      };
    }

    if (image && !slot.required && masterSize && !matchesPlate(image, masterSize)) {
      if (debug) console.warn(`Chegada: ${slot.name} ignorada por dimensão diferente da master`);
      image = null;
    }

    const texture = image ? createTexture(gl, image, slot.unit) : createEmptyTexture(gl, slot.unit);
    textures.push(texture);
    loaded[slot.key] = image;
    flags[slot.key] = image ? 1 : 0;
  }

  dropped.forEach((slot) => {
    flags[slot.key] = 0;
  });

  const master = loaded.image;
  return {
    textures,
    flags,
    imageSize: [
      master?.naturalWidth || master?.width || masterSize?.width || 1,
      master?.naturalHeight || master?.height || masterSize?.height || 1,
    ],
    textureCount: textures.length,
    maxUnits,
  };
}
