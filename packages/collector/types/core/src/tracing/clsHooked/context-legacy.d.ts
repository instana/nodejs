/**
 * @param {string} name
 */
export function getNamespace(name: string): any;
/**
 * @param {string} name
 */
export function createNamespace(name: string): Namespace;
/**
 * @param {string} name
 */
export function destroyNamespace(name: string): void;
export function reset(): void;
/**
 * @param {string} name
 */
export function Namespace(name: string): void;
export class Namespace {
    /**
     * @param {string} name
     */
    constructor(name: string);
    name: string;
    active: {
        [x: string]: any;
    };
    /** @type {Array.<import('./context').InstanaCLSContext>} */
    _set: Array<import('./context').InstanaCLSContext>;
    id: any;
    _contexts: Map<any, any>;
    /**
     * @param {string} key
     * @param {*} value
     * @returns
     */
    set(key: string, value: any): any;
    /**
     * @param {string} key
     * @returns {*}
     */
    get(key: string): any;
    /**
     *
     * @returns {import('../clsHooked/context').InstanaCLSContext}
     */
    createContext(): import('../clsHooked/context').InstanaCLSContext;
    /**
     * @param {Function} fn
     * @param {import('./context').InstanaCLSContext} ctx
     * @returns {import('./context').InstanaCLSContext}
     */
    run(fn: Function, ctx: import('./context').InstanaCLSContext): import('./context').InstanaCLSContext;
    /**
     * @param {Function} fn
     * @param {import('./context').InstanaCLSContext} ctx
     */
    runAndReturn(fn: Function, ctx: import('./context').InstanaCLSContext): undefined;
    /**
     * Uses global Promise and assumes Promise is cls friendly or wrapped already.
     * @param {Function} fn
     * @param {import('./context').InstanaCLSContext} ctx
     * @returns {void | Promise<*>}
     */
    runPromise(fn: Function, ctx: import('./context').InstanaCLSContext): void | Promise<any>;
    /**
     * @param {Function} _fn
     * @returns {Error}
     */
    runPromiseOrRunAndReturn(_fn: Function): Error;
    /**
     * @param {Function} fn
     * @param {import('./context').InstanaCLSContext} context
     */
    bind(fn: Function, context: import('./context').InstanaCLSContext): (...args: any[]) => any;
    /**
     * @param {import('./context').InstanaCLSContext} context
     */
    enter(context: import('./context').InstanaCLSContext): void;
    /**
     * @param {import('./context').InstanaCLSContext} context
     */
    exit(context: import('./context').InstanaCLSContext): void;
    /**
     * @param {import('events').EventEmitter} emitter
     */
    bindEmitter(emitter: import('events').EventEmitter): void;
}
