export function init(config: import('@instana/core/src/metrics').InstanaConfig): void;
export function activate(): void;
export function deactivate(): void;
export function gatherData(): {
    [x: string]: string;
};
