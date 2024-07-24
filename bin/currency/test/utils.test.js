/*
 * (c) Copyright IBM Corp. 2024
 */

'use strict';

const { getDaysBehind } = require('../utils');
const assert = require('assert');

const today = '2024-07-23T00:00:00.000Z';

const releaseList1 = {
  '17.0.0': '2024-02-11T17:27:44.577Z',
  '18.0.0': '2024-02-28T21:21:55.511Z',
  '18.1.0': '2024-03-02T10:47:28.209Z',
  '18.2.0': '2024-04-18T17:00:07.788Z',
  '18.2.1': '2024-06-14T22:43:15.078Z',
  '18.2.2': '2024-06-26T19:31:32.324Z',
  '18.2.3': '2024-06-26T20:40:46.733Z',
  '18.2.4': '2024-07-04T19:12:05.136Z',
  '18.3.0': '2024-07-15T10:56:20.883Z'
};
const installedVersion1 = '17.0.0';

const releaseList2 = {
  '12.23.0': '2024-06-04T09:07:07.235Z',
  '12.23.0-alpha.20240604.1': '2024-06-05T00:38:46.865Z',
  '12.24.0-beta.1': '2024-06-13T06:57:00.162Z',
  '12.24.0-alpha.20240613.2': '2024-06-14T00:28:10.417Z',
  '12.24.0': '2024-07-23T06:04:06.101Z',
  '12.24.1-alpha.20240723.2': '2024-07-24T00:27:37.973Z'
};

const installedVersion2 = '12.23.0';

const releaseList3 = {
  '3.2.9': '2022-07-18T15:21:10.989Z',
  '3.2.10': '2022-07-31T08:02:25.368Z',
  '3.3.0': '2022-11-10T21:47:30.429Z',
  '2.6.8': '2023-01-13T01:04:20.236Z',
  '2.6.9': '2023-01-30T22:00:06.583Z',
  '3.3.1': '2023-03-11T10:47:49.391Z',
  '2.6.10': '2023-05-08T16:20:45.981Z',
  '2.6.11': '2023-05-09T11:06:32.325Z',
  '2.6.12': '2023-06-29T19:16:33.256Z',
  '3.3.2': '2023-07-25T11:50:17.626Z',
  '2.6.13': '2023-08-18T20:24:16.578Z',
  '2.7.0': '2023-08-23T17:18:39.396Z'
};

const installedVersion3 = '2.6.12';

try {
  const daysBehind1 = getDaysBehind(releaseList1, installedVersion1, today);
  assert.strictEqual(daysBehind1, 145);
  console.log('Test 1 passed: Installed version is 145 days behind the latest version.');

  const daysBehind2 = getDaysBehind(releaseList2, installedVersion2, today);
  assert.strictEqual(daysBehind2, 0);
  console.log('Test 2 passed: Installed version is 0 days behind the latest version.');

  const daysBehind3 = getDaysBehind(releaseList3, installedVersion3, today);
  assert.strictEqual(daysBehind3, 363);
  console.log('Test 2 passed: Installed version is 363 days behind the latest version.');
} catch (error) {
  console.error('Test failed:', error);
}
