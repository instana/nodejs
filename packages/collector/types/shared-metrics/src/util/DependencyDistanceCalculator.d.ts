export function setLogger(_logger: import('@instana/core/src/logger').GenericLogger): void;
export class DependencyDistanceCalculator {
    /**
     * Calculates the distance for all dependencies, starting at the given package.json file. Direct dependencies listed
     * in the passed package.json have distance 1. Dependencies of those dependencies have distance 2, and so on. This is
     * calculated by parsing package.json files recursively, traversing the tree of dependencies.
     *
     * @param {string} packageJsonPath the path to the package.json file to examine initially
     * @param {(distances: Object<string, any>) => void} callback
     */
    calculateDistancesFrom(packageJsonPath: string, callback: (distances: {
        [x: string]: any;
    }) => void): void;
    started: number;
    /** @type {Object.<string, any>} */
    distancesFromRoot: {
        [x: string]: any;
    };
    globalCountDownLatchAllPackages: CountDownLatch;
    /**
     * Calculates the distances for the dependencies in the given package.json file. Direct dependencies of the
     * application have distance 1. Dependencies of those dependencies have distance 2, and so on. This is calculated by
     * parsing package.json files recursively, traversing the tree of dependencies.
     *
     * @param {string} packageJsonPath The path to the package.json file to examine
     * @param {number} distance The distance from the application along the tree of dependencies
     */
    _calculateDistances(packageJsonPath: string, distance: number): void;
    /**
     * Iterates over the given set of dependencies to calculate their distances. The set of dependencies will what is
     * defined in a package.json file for one particular type of dependencys (normal, optional, or peer).
     *
     * @param {Array<string>} dependencies The dependencies to analyze
     * @param {number} distance How far the dependencies are from the root package
     */
    _calculateDistancesForOneType(dependencies: Array<string>, distance: number): void;
    /**
     * Handles a single dependency found in a package.json file.
     *
     * @param {string} dependency the name of the dependency to analyze
     * @param {number} distance how far this dependency is from the root package
     * @param {import('./CountDownLatch')} localCountDownLatchForThisNode
     */
    _handleTransitiveDependency(dependency: string, distance: number, localCountDownLatchForThisNode: import('./CountDownLatch')): void;
}
declare namespace module {
    namespace exports {
        export { setLogger };
    }
}
import CountDownLatch = require("./CountDownLatch");
export declare const MAX_DEPTH: number;
export { module as __moduleRefExportedForTest };
