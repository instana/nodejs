export var payloadPrefix: string;
export var currentPayload: {
    minorGcs: number;
    majorGcs: number;
    incrementalMarkings: number;
    weakCallbackProcessing: number;
    gcPause: number;
    statsSupported?: boolean;
    usedHeapSizeAfterGc?: number;
};
export function activate(): void;
export function deactivate(): void;
