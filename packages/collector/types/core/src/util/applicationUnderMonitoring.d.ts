export function isAppInstalledIntoNodeModules(): boolean;
/**
 * Looks for the app's main package.json file, parses it and returns the parsed content. The search is started at
 * path.dirname(process.mainModule.filename).
 *
 * In case the search is successful, the result will be cached for consecutive invocations.
 *
 * @param {(err: Error, parsedMainPackageJson: Object.<string, *>) => void } cb - the callback will be called with an
 * error or the parsed package.json file as a JS object.
 */
export function getMainPackageJsonStartingAtMainModule(cb: (err: Error, parsedMainPackageJson: {
    [x: string]: any;
}) => void): void;
/**
 * Looks for the app's main package.json file, parses it and returns the parsed content. If the given directory is null
 * or undefined, the search will start at path.dirname(process.mainModule.filename).
 *
 * In case the search is successful, the result will be cached for consecutive invocations.
 *
 * @param {string} startDirectory - the directory in which to start searching.
 * @param {(err: Error, parsedMainPackageJson: Object.<string, *>) => void } cb - the callback will be called with an
 * error or the parsed package.json file as a JS object.
 */
export function getMainPackageJsonStartingAtDirectory(startDirectory: string, cb: (err: Error, parsedMainPackageJson: {
    [x: string]: any;
}) => void): void;
/**
 * Looks for path of the app's main package.json file, starting the search at path.dirname(process.mainModule.filename).
 *
 * In case the search is successful, the result will be cached for consecutive invocations.
 *
 * @param {(err: Error, packageJsonPath: string) => void} cb - the callback will be called with an error or the path to
 * the package.json file
 */
export function getMainPackageJsonPathStartingAtMainModule(cb: (err: Error, packageJsonPath: string) => void): void;
/**
 * Looks for path of the app's main package.json file, starting the search at the given directory. If the given
 * directory is null or undefined, the search will start at path.dirname(process.mainModule.filename).
 *
 * In case the search is successful, the result will be cached for consecutive invocations.
 *
 * @param {string} startDirectory - the directory in which to start searching.
 * @param {(err: Error, packageJsonPath: string) => void} cb - the callback will be called with an error or the path to
 * the package.json file
 */
export function getMainPackageJsonPathStartingAtDirectory(startDirectory: string, cb: (err: Error, packageJsonPath: string) => void): void;
/**
 * @param {(errNodeModules: *, nodeModulesFolder: *) => *} cb
 */
export function findNodeModulesFolder(cb: (errNodeModules: any, nodeModulesFolder: any) => any): void;
export function getMainPackageJson(startDirectory: any, cb: any): void;
export function getMainPackageJsonPath(startDirectory: any, cb: any): void;
