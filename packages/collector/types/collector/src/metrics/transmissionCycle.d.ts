export function init(config: import('@instana/core/src/metrics').InstanaConfig): void;
export function activate(_metrics: typeof import("./"), _downstreamConnection: typeof import("../agentConnection"), _onSuccess: (requests: Array<import('../agent/requestHandler').AnnounceRequest>) => void, _onError: () => void): void;
export function deactivate(): void;
