import '@testing-library/jest-dom/vitest';

// jsdom has no canvas; axe probes one. Without a context axe skips those checks quietly.
if (typeof HTMLCanvasElement !== 'undefined')
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
