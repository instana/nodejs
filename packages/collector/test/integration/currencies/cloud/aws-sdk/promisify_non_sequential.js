/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2021
 */

'use strict';

/**
 *
 * @param {(controls: *, response: *, apiPath: *, operation: *, withError: *) => *} verify
 * @param {Array.<string>} operations
 * @param {import('../../../test_util/ProcessControls')} appControls
 * @param {boolean} withError
 * @param {() => string} getNextCallMethod
 * @param {import('../../../test_util/ProcessControls').ProcessControlsOptions} [additionalControlOptions]
 * @returns {Promise.<*>}
 */
exports.promisifyNonSequentialCases = function promisifyNonSequentialCases(
  verify,
  operations,
  appControls,
  withError,
  getNextCallMethod,
  additionalControlOptions = {}
) {
  return Promise.all(
    operations.map(operation => {
      const requestMethod = getNextCallMethod();
      const withErrorOption = withError ? '?withError=1' : '';
      const apiPath = `/${operation}/${requestMethod}`;
      return new Promise((resolve, reject) => {
        const options = Object.assign(
          {
            method: 'GET',
            path: `${apiPath}${withErrorOption}`,
            simple: withError === false
          },
          additionalControlOptions
        );
        appControls
          .sendRequest(options)
          .then(response => {
            resolve(verify(appControls, response, apiPath, operation, withError));
          })
          .catch(reject);
      });
    })
  );
};
