declare function _exports(object: {
    [x: string]: any;
}, prefix?: string): PropertySize[];
export = _exports;
export type PropertySize = {
    property: string;
    length: number;
};
