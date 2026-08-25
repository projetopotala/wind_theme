const PROFILES = {
  desktop: {
    travelers: [
      [0.554, 0.745, 0.028, 0.105],
      [0.597, 0.745, 0.027, 0.11],
      [0.618, 0.725, 0.018, 0.055],
    ],
    river: [
      [0.43, 0.695],
      [0.505, 0.715],
      [0.485, 0.75],
      [0.455, 0.785],
      [0.482, 0.82],
      [0.455, 0.865],
      [0.39, 0.87],
      [0.345, 0.845],
      [0.31, 0.815],
      [0.34, 0.775],
      [0.39, 0.735],
    ],
    clouds: [
      [0.48, 0],
      [0.8, 0],
      [0.78, 0.12],
      [0.76, 0.22],
      [0.73, 0.3],
      [0.7, 0.33],
      [0.67, 0.36],
      [0.64, 0.39],
      [0.6, 0.44],
      [0.56, 0.45],
      [0.53, 0.42],
      [0.5, 0.46],
      [0.46, 0.47],
      [0.42, 0.48],
      [0.38, 0.49],
      [0.34, 0.51],
      [0.3, 0.52],
      [0.25, 0.5],
      [0.28, 0.43],
      [0.34, 0.39],
      [0.4, 0.32],
      [0.45, 0.22],
    ],
  },
  mobile: {
    travelers: [
      [0.638, 0.615, 0.045, 0.085],
      [0.543, 0.58, 0.035, 0.075],
      [0.58, 0.58, 0.03, 0.075],
    ],
    river: [
      [0.325, 0.575],
      [0.515, 0.59],
      [0.49, 0.625],
      [0.455, 0.66],
      [0.425, 0.695],
      [0.365, 0.73],
      [0.245, 0.725],
      [0.195, 0.7],
      [0.215, 0.665],
      [0.275, 0.625],
    ],
    clouds: [
      [0.6, 0],
      [0.98, 0],
      [0.98, 0.2],
      [0.92, 0.22],
      [0.88, 0.28],
      [0.84, 0.35],
      [0.8, 0.38],
      [0.76, 0.4],
      [0.72, 0.4],
      [0.68, 0.41],
      [0.64, 0.41],
      [0.6, 0.44],
      [0.56, 0.44],
      [0.52, 0.46],
      [0.48, 0.45],
      [0.44, 0.47],
      [0.4, 0.47],
      [0.36, 0.48],
      [0.31, 0.48],
      [0.26, 0.47],
      [0.21, 0.45],
      [0.24, 0.39],
      [0.3, 0.34],
      [0.37, 0.29],
      [0.44, 0.23],
      [0.51, 0.15],
      [0.56, 0.08],
    ],
  },
};

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const [currentX, currentY] = polygon[current];
    const [previousX, previousY] = polygon[previous];
    const crosses = (currentY > y) !== (previousY > y)
      && x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY || 1e-6) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInEllipse(x, y, [centerX, centerY, radiusX, radiusY]) {
  const normalizedX = (x - centerX) / radiusX;
  const normalizedY = (y - centerY) / radiusY;
  return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
}

function profileFor(portrait) {
  return portrait ? PROFILES.mobile : PROFILES.desktop;
}

export function isArrivalRiverPoint({ x = 0, y = 0, portrait = false } = {}) {
  return pointInPolygon(x, y, profileFor(portrait).river);
}

export function isArrivalCloudPoint({ x = 0, y = 0, portrait = false } = {}) {
  return pointInPolygon(x, y, profileFor(portrait).clouds);
}

export function isArrivalTravelerPoint({ x = 0, y = 0, portrait = false } = {}) {
  return profileFor(portrait).travelers.some((traveler) => pointInEllipse(x, y, traveler));
}

export function computeCloudMotionState({ elapsed = 0, reducedMotion = false } = {}) {
  if (reducedMotion) return { nearOffset: 0, farOffset: 0, intensity: 0 };
  const time = Math.max(0, Number(elapsed) || 0);
  const phase = Number(((time % 120) / 120).toFixed(6));
  return {
    nearOffset: phase,
    farOffset: Number(((phase + 0.37) % 1).toFixed(6)),
    intensity: 1,
  };
}
