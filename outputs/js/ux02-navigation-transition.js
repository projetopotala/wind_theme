export function shouldTransitionNavigation(event, destination, { origin, reducedMotion = false }) {
  return Boolean(
    destination
    && destination.origin === origin
    && !reducedMotion
    && !event.defaultPrevented
    && event.button === 0
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey
  );
}
