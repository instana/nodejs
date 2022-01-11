export var currentPayload: {
    [x: string]: any;
};
export { preliminaryPayload as currentPayload };
export function setLogger(_logger: import('@instana/core/src/logger').GenericLogger): void;
export var MAX_DEPENDENCIES: number;
export var payloadPrefix: string;
export var MAX_ATTEMPTS: number;
export function activate(): void;
/** @type {Object.<string, *>} */
declare const preliminaryPayload: {
    [x: string]: any;
};
