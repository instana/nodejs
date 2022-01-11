export function init(_config: import('../util/normalizeConfig').CollectorConfig, _downstreamConnection: typeof import("../agentConnection"), _processIdentityProvider: typeof import("../pidStore")): void;
export function activate(): void;
export function deactivate(): void;
export type InstanaExtendedError = import('@instana/core/src/util/stackTrace').InstanaExtendedError;
export type SerializedErrorObject = {
    name: string;
    message: string;
    stack: string;
};
