const DIRECTIONS = [
  { x: 0, y: 1 },
  { x: .42, y: .91 },
  { x: -.38, y: .92 },
  { x: 1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -.36, y: .93 },
  { x: 0, y: 1 },
];

/**
 * Quanto de estrada a câmera percorre em cada seção da página.
 *
 * A altura das seções não muda com ele, então este fator é a única coisa que
 * separa a velocidade da estrada da velocidade da rolagem. Em 1 a estrada corria
 * a cerca de 1,8× o scroll — passava rápido demais para uma travessia. Os três
 * comprimentos são escalados juntos, de propósito: mexer só nas retas mudaria a
 * frequência das curvas e a estrada ficaria mais agitada, não mais calma.
 */
const ROAD_TRAVEL = .7;

const normalize = ({ x, y }) => {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
};

const add = (point, vector, amount = 1) => ({
  x: point.x + vector.x * amount,
  y: point.y + vector.y * amount,
});

const samePoint = (point) => ({ x: point.x, y: point.y });

const OPPOSITE_PLACEMENT = {
  left: "right",
  right: "left",
  top: "bottom",
  bottom: "top",
};

function sampleRawSegment(segment, t) {
  if (segment.kind !== "curve") {
    return {
      x: segment.from.x + (segment.to.x - segment.from.x) * t,
      y: segment.from.y + (segment.to.y - segment.from.y) * t,
    };
  }
  if (segment.control1 && segment.control2) {
    const inverse = 1 - t;
    return {
      x: inverse ** 3 * segment.from.x
        + 3 * inverse ** 2 * t * segment.control1.x
        + 3 * inverse * t ** 2 * segment.control2.x
        + t ** 3 * segment.to.x,
      y: inverse ** 3 * segment.from.y
        + 3 * inverse ** 2 * t * segment.control1.y
        + 3 * inverse * t ** 2 * segment.control2.y
        + t ** 3 * segment.to.y,
    };
  }
  const inverse = 1 - t;
  return {
    x: inverse * inverse * segment.from.x + 2 * inverse * t * segment.control.x + t * t * segment.to.x,
    y: inverse * inverse * segment.from.y + 2 * inverse * t * segment.control.y + t * t * segment.to.y,
  };
}

function measureCurve(segment, steps = 96) {
  const samples = [{ t: 0, distance: 0 }];
  let total = 0;
  let previous = sampleRawSegment(segment, 0);
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const current = sampleRawSegment(segment, t);
    total += Math.hypot(current.x - previous.x, current.y - previous.y);
    samples.push({ t, distance: total });
    previous = current;
  }
  return { samples, total };
}

function curveTimeForProgress(segment, progress) {
  const arc = segment.arc;
  if (!arc?.total) return progress;
  const target = progress * arc.total;
  let low = 0;
  let high = arc.samples.length - 1;
  while (low < high - 1) {
    const middle = Math.floor((low + high) / 2);
    if (arc.samples[middle].distance < target) low = middle;
    else high = middle;
  }
  const before = arc.samples[low];
  const after = arc.samples[high];
  const local = (target - before.distance) / Math.max(.0001, after.distance - before.distance);
  return before.t + (after.t - before.t) * local;
}

function resolveRoadPlacement(region, direction, index) {
  const horizontal = Math.abs(direction.x) > Math.abs(direction.y);
  const requested = region.roadPlacement;
  if (horizontal) {
    if (requested === "top" || requested === "bottom") return requested;
    return index % 2 === 0 ? "top" : "bottom";
  }
  if (requested === "left" || requested === "right") return requested;
  return index % 2 === 0 ? "right" : "left";
}

export function sampleSegment(segment, progress) {
  const progressValue = Math.max(0, Math.min(1, Number(progress) || 0));
  const t = segment.kind === "curve" ? curveTimeForProgress(segment, progressValue) : progressValue;
  return sampleRawSegment(segment, t);
}

export function roadOffsetForPathSection(sectionIndex, localProgress, checkpoints) {
  if (!checkpoints.length) return { x: 0, y: 0 };
  const safeIndex = Math.max(0, Math.floor(Number(sectionIndex) || 0));
  const checkpointIndex = Math.min(checkpoints.length - 1, Math.floor(safeIndex / 2));
  const current = checkpoints[checkpointIndex];
  if (safeIndex % 2 === 0 || checkpointIndex >= checkpoints.length - 1) {
    return { x: current.roadOffsetX || 0, y: current.roadOffsetY || 0 };
  }
  const next = checkpoints[checkpointIndex + 1];
  const rawProgress = Math.max(0, Math.min(1, Number(localProgress) || 0));
  const eased = rawProgress * rawProgress * (3 - 2 * rawProgress);
  return {
    x: (current.roadOffsetX || 0) + ((next.roadOffsetX || 0) - (current.roadOffsetX || 0)) * eased,
    y: (current.roadOffsetY || 0) + ((next.roadOffsetY || 0) - (current.roadOffsetY || 0)) * eased,
  };
}

export function silenceCopyPlacementForRoadOffset(offset = {}) {
  const x = Number(offset.x) || 0;
  const y = Number(offset.y) || 0;
  if (Math.abs(x) >= Math.abs(y)) return x <= 0 ? "right" : "left";
  return y <= 0 ? "bottom" : "top";
}

export function buildJourneyLayout(regions, viewport = {}) {
  const width = Math.max(320, Number(viewport.width) || 1440);
  const height = Math.max(480, Number(viewport.height) || 900);
  const maxDimension = Math.max(width, height);
  const regularStraight = maxDimension * 1.82 * ROAD_TRAVEL;
  const capStraight = Math.max(regularStraight, height * 4.6 * ROAD_TRAVEL);
  const curveLength = maxDimension * .72 * ROAD_TRAVEL;
  const mobile = width < 720;
  const segments = [];
  const checkpoints = [];
  let cursor = { x: width * .5, y: -height * 2.2 };

  regions.forEach((region, index) => {
    const direction = normalize(DIRECTIONS[index % DIRECTIONS.length]);
    const straightLength = index === 0 || index === regions.length - 1 ? capStraight : regularStraight;
    const straight = {
      id: `straight-${region.id}`,
      kind: "straight",
      from: samePoint(cursor),
      to: add(cursor, direction, straightLength),
      direction,
      length: straightLength,
      regionId: region.id,
    };
    segments.push(straight);

    const center = sampleSegment(straight, .5);
    const roadPlacement = resolveRoadPlacement(region, direction, index);
    const horizontalPlacement = roadPlacement === "left" || roadPlacement === "right";
    const placementSign = roadPlacement === "left" || roadPlacement === "top" ? -1 : 1;
    const roadOffsetX = horizontalPlacement ? placementSign * width * (mobile ? .36 : .34) : 0;
    const roadOffsetY = horizontalPlacement ? 0 : placementSign * height * (mobile ? .35 : .34);
    checkpoints.push({
      id: region.id,
      x: center.x,
      y: center.y,
      segmentId: straight.id,
      segmentKind: "straight",
      clearance: height * .78,
      roadOffsetX,
      roadOffsetY,
      panelOffsetX: -roadOffsetX,
      panelOffsetY: -roadOffsetY,
      roadPlacement,
      panelPlacement: OPPOSITE_PLACEMENT[roadPlacement],
    });

    cursor = samePoint(straight.to);
    if (index >= regions.length - 1) return;

    const nextDirection = normalize(DIRECTIONS[(index + 1) % DIRECTIONS.length]);
    const curveTo = add(add(cursor, direction, curveLength * .54), nextDirection, curveLength * .54);
    const curve = {
      id: `curve-${region.id}-${regions[index + 1].id}`,
      kind: "curve",
      from: samePoint(cursor),
      control1: add(cursor, direction, curveLength * .46),
      control2: add(curveTo, nextDirection, -curveLength * .46),
      to: curveTo,
      direction: nextDirection,
      between: [region.id, regions[index + 1].id],
    };
    curve.arc = measureCurve(curve);
    curve.length = curve.arc.total;
    segments.push(curve);
    cursor = samePoint(curve.to);
  });

  return {
    width,
    height,
    mobile,
    segments,
    checkpoints,
    start: samePoint(segments[0]?.from || cursor),
    end: samePoint(segments.at(-1)?.to || cursor),
    totalLength: segments.reduce((sum, segment) => sum + segment.length, 0),
  };
}

export { DIRECTIONS };
