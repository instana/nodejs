export function create(opts: SlidingWindowOptions): {
    addPoint: (v: any) => void;
    reduce: (reducer: Function, initial: any) => any;
    sum: () => number;
    clear: () => void;
    getValues: () => any[];
    getUniqueValues: () => any[];
    getPercentiles: (percentiles: Array<number>) => any[];
};
export type SlidingWindowOptions = {
    duration?: number;
};
