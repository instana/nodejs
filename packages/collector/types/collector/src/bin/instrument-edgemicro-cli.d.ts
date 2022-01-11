#!/usr/bin/env node
export = instrumentEdgemicroCli;
/**
 * @param {string | ((err?: Error) => *) | undefined} edgemicroPath
 * @param {string | ((err?: Error) => *) | undefined} collectorPath
 * @param {(err?: Error) => * | undefined} callback
 * @returns
 */
declare function instrumentEdgemicroCli(edgemicroPath: string | ((err?: Error) => any), collectorPath: string | ((err?: Error) => any), callback: (err?: Error) => any | undefined): any;
