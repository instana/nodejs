export function init(config: import('../../util/normalizeConfig').InstanaConfig, _automaticTracingEnabled: boolean, processIdentityProvider: typeof import("../../../../collector/src/pidStore")): void;
export function createTracer(): import("./Tracer");
export function activate(): void;
export function deactivate(): void;
export function getCurrentlyActiveInstanaSpanContext(): opentracing.SpanContext;
import opentracing = require("opentracing");
