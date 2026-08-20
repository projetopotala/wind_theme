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

const normalize = ({ x, y }) => {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
};

const add = (point, vector, amount = 1) => ({
  x: point.x + vector.x * amount,
  y: point.y + vector.y * amount,
});

const samePoint = (point) => ({ x: point.x, y: point.y });

export function sampleSegment(segment, progress) {
  const t = Math.max(0, Math.min(1, Number(progress) || 0));
  if (segment.kind !== "curve") {
    return {
      x: segment.from.x + (segment.to.x - segment.from.x) * t,
      y: segment.from.y + (segment.to.y - segment.from.y) * t,
    };
  }
  const inverse = 1 - t;
  return {
    x: inverse * inverse * segment.from.x + 2 * inverse * t * segment.control.x + t * t * segment.to.x,
    y: inverse * inverse * segment.from.y + 2 * inverse * t * segment.control.y + t * t * segment.to.y,
  };
}

export function buildJourneyLayout(regions, viewport = {}) {
  const width = Math.max(320, Number(viewport.width) || 1440);
  const height = Math.max(480, Number(viewport.height) || 900);
  const maxDimension = Math.max(width, height);
  const regularStraight = maxDimension * 1.82;
  const capStraight = Math.max(regularStraight, height * 4.6);
  const curveLength = maxDimension * .72;
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
    const side = mobile
      ? (index % 2 === 0 ? -1 : 1)
      : (region.roadPlacement === "left" ? -1 : 1);
    const roadOffsetX = side * width * (mobile ? .29 : .24);
    checkpoints.push({
      id: region.id,
      x: center.x,
      y: center.y,
      segmentId: straight.id,
      segmentKind: "straight",
      clearance: height * .78,
      roadOffsetX,
      panelOffsetX: -roadOffsetX,
      roadPlacement: side < 0 ? "left" : "right",
    });

    cursor = samePoint(straight.to);
    if (index >= regions.length - 1) return;

    const nextDirection = normalize(DIRECTIONS[(index + 1) % DIRECTIONS.length]);
    const curveTo = add(cursor, nextDirection, curveLength);
    const curve = {
      id: `curve-${region.id}-${regions[index + 1].id}`,
      kind: "curve",
      from: samePoint(cursor),
      control: add(cursor, direction, curveLength * .72),
      to: curveTo,
      direction: nextDirection,
      length: curveLength,
      between: [region.id, regions[index + 1].id],
    };
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
