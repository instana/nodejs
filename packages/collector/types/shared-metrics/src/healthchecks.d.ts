export var currentPayload: {};
export { results as currentPayload };
export function setLogger(_logger: import('@instana/core/src/logger').GenericLogger): void;
export var payloadPrefix: string;
export function activate(config: import('@instana/core/src/util/normalizeConfig').InstanaConfig): void;
export function deactivate(): void;
/** @type {Object.<string, *>} */
declare const results: {
    [x: string]: any;
};
