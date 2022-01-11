export function init(config?: import('./normalizeConfig').InstanaConfig): void;
export function teardownForTestPurposes(): void;
export function onModuleLoad(moduleName: string, fn: Function): void;
export function onFileLoad(pattern: RegExp, fn: Function): void;
export function buildFileNamePattern(arr: Array<string>): RegExp;
export type FileNamePatternTransformer = {
    fn: Function;
    pattern: RegExp;
};
export type ExecutedHook = {
    originalModuleExports: any;
    moduleExports: any;
    appliedByModuleNameTransformers: Array<string>;
    byFileNamePatternTransformersApplied: boolean;
};
export type ExecutedHooks = {
    [x: string]: ExecutedHook;
};
