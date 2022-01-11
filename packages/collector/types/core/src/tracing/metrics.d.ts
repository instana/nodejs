export function incrementOpened(): void;
export function incrementClosed(): void;
export function incrementDropped(dropped: number): void;
export function getAndReset(): {
    opened: number;
    closed: number;
    dropped: number;
};
