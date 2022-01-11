export type InstanaCLSContext = {
    [x: string]: any;
};
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
 * @typedef {Object.<string, *>} InstanaCLSContext
 */
/**
 * Creates a new CLS namespace.
 */
/**
 * @param {string} name
 */
export function Namespace(name: string): void;
export class Namespace {
    /**
     * @typedef {Object.<string, *>} InstanaCLSContext
     */
    /**
     * Creates a new CLS namespace.
     */
    /**
     * @param {string} name
     */
    constructor(name: string);
    name: string;
    active: {
        [x: string]: any;
    };
    /** @type {Array.<InstanaCLSContext>} */
    _set: Array<InstanaCLSContext>;
    id: any;
    _contexts: Map<any, any>;
    _indent: number;
    /**
     * Sets a key/value pair in the current CLS context. It can be retrieved later, but only from the same context
     * or a child context.
     * @param {string} key
     * @param {*} value
     * @returns
     */
    set(key: string, value: any): any;
    /**
     * Retrieves a value by key from the current CLS context (or a parent context), assuming the key/value pair has
     * been set earlier in this context.
     * @param {string} key
     */
    get(key: string): any;
    /**
     * Creates a new CLS context in this namespace.
     */
    createContext(): any;
    /**
     * Runs a function in a new CLS context. The context is left after the function terminates. Asynchronous work
     * started in this function will happen in that new context. The return value from that function (if any) is discarded.
     * If you aren't 100% certain that the function never returns a value or that client code never relies on that value,
     * use runAndReturn instead.
     * @param {Function} fn
     * @param {InstanaCLSContext} ctx
     */
    run(fn: Function, ctx: InstanaCLSContext): any;
    /**
     * Runs a function in a new CLS context and returns its return value. The context is left after the function
     * terminates. Asynchronous work started in this function will happen in that new context.
     * @param {Function} fn
     * @param {InstanaCLSContext} ctx
     */
    runAndReturn(fn: Function, ctx: InstanaCLSContext): undefined;
    /**
     * Runs a function which returns a promise in a new CLS context and returns said promise. The context is left
     * as soon as the the promise resolves/is rejected. Asynchronous work started in this promise will happen in that new
     * context.
     *
     * If the given function does not create a then-able, an error will be thrown.
     *
     * This function assumes that the returned promise is CLS-friendly or wrapped already.
     * @param {Function} fn
     * @param {InstanaCLSContext} ctx
     */
    runPromise(fn: Function, ctx: InstanaCLSContext): any;
    /**
     * Runs a function (which might or might not return a promise) in a new CLS context. If the given function indeed
     * returns a then-able, this behaves like runPromise. If not, this behaves like runAndReturn. In particular, no error is
     * thrown if the given function does not return a promise.
     *
     * This function assumes that the returned promise (if any) is CLS-friendly or wrapped already.
     * @param {Function} fn
     * @param {InstanaCLSContext} ctx
     */
    runPromiseOrRunAndReturn(fn: Function, ctx: InstanaCLSContext): any;
    /**
     * Returns a wrapper around the given function which will enter CLS context which is active at the time of calling bind
     * and leave that context once the function terminates. If no context is active, a new context will be created.
     * @param {Function} fn
     * @param {InstanaCLSContext} context
     */
    bind(fn: Function, context: InstanaCLSContext): (...args: any[]) => any;
    /**
     * Binds the given emitter to the currently active CLS context. Work triggered by an emit from that emitter will happen
     * in that CLS context.
     * @param {import('events').EventEmitter} emitter
     */
    bindEmitter(emitter: import('events').EventEmitter): void;
    /**
     * @param {InstanaCLSContext} context
     */
    enter(context: InstanaCLSContext): void;
    /**
     * @param {InstanaCLSContext} context
     */
    exit(context: InstanaCLSContext): void;
}
