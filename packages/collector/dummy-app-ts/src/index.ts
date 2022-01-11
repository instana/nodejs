/*
 * (c) Copyright IBM Corp. 2022
 * (c) Copyright Instana Inc. and contributors 2019
 */

'use strict';

/**
 * The purpose of this project is to play with intellisense when Typescript is used.
 * So we can test how much of our typings is actually visible in the public SDK
 */

import instana from '../..';

instana.sdk.callback.startExitSpan('lala', () => {});

