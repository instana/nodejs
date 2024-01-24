/*
 * (c) Copyright IBM Corp. 2022
 */

'use strict';

const lambdaType = 'promise';

describe(`aws/lambda/${lambdaType}`, function () {
  require('./test_definition').call(this, lambdaType, true);
});
