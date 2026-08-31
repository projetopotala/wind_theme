import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJourneyHref, scrollTopForProgress } from "../../features/potala-journey/lib/journey-navigation";

test("preserva a rota canonica e marca a origem da jornada", () => {
  assert.equal(canonicalJourneyHref("/cursos"), "/cursos?from=journey");
  assert.equal(canonicalJourneyHref("/cursos?campanha=outono"), "/cursos?campanha=outono&from=journey");
});

test("calcula scroll nativo sem tocar no tempo do video", () => {
  assert.equal(scrollTopForProgress({ top: 200, height: 1200, viewportHeight: 600 }, 0.5), 500);
  assert.equal(scrollTopForProgress({ top: 200, height: 1200, viewportHeight: 600 }, -1), 200);
  assert.equal(scrollTopForProgress({ top: 200, height: 1200, viewportHeight: 600 }, 2), 800);
});
