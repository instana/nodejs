/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. 2019
 */

'use strict';

require('@instana/collector')();

const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const express = require('express');
const fs = require('fs');
const morgan = require('morgan');
const path = require('path');
const pg = require('pg');

const logPrefix = `Audit Log Service (${process.pid}):\t`;

dotenv.config();

const pgHost = process.env.RDS_HOSTNAME || 'localhost';
const pgPort = process.env.RDS_PORT || '5432';
const pgDatabase = process.env.RDS_DB_NAME || 'lambdademo';
const pgUser = process.env.RDS_USERNAME || 'postgres';
const pgPassword = process.env.RDS_PASSWORD;
const port = process.env.APP_PORT || 2808;

const instanaReportingUrl = process.env.INSTANA_EUM_REPORTING_URL;
const instanaWebsiteKey = process.env.INSTANA_WEBSITE_KEY;
const lambdaUrl = process.env.LAMBDA_URL;

if (!instanaReportingUrl || instanaReportingUrl.length === 0) {
  log('You need to set INSTANA_EUM_REPORTING_URL to enable EUM.');
}
if (!instanaWebsiteKey || instanaWebsiteKey.length === 0) {
  log('You need to set INSTANA_WEBSITE_KEY to enable EUM.');
}
if (instanaReportingUrl && instanaReportingUrl.length > 0 && instanaWebsiteKey && instanaWebsiteKey.length > 0) {
  log(`Using EUM reporting URL ${instanaReportingUrl} and key ${instanaWebsiteKey}.`);
}
if (!lambdaUrl || lambdaUrl.length === 0) {
  log('You need to set LAMBDA_URL to enable AJAX requests to be tracked by EUM.');
} else {
  log(`Using Lambda URL ${lambdaUrl} for AJAX requests.`);
}

log(
  `Using PG config: ${pgHost}:${pgPort}/${pgDatabase}, user ${pgUser}, ${
    pgPassword ? 'a password has been provided.' : 'no password has been provided!'
  }`
);

const pool = new pg.Pool({
  host: pgHost,
  port: pgPort,
  database: pgDatabase,
  user: pgUser,
  password: pgPassword
});

const app = express()
  .use(morgan(`${logPrefix}:method :url :status`))
  .use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/app', (req, res) => {
  /* eslint no-useless-escape: 'off' */
  let head = '';
  if (instanaReportingUrl && instanaReportingUrl.length > 0 && instanaWebsiteKey && instanaWebsiteKey.length > 0) {
    head =
      //
      `<head>
        <script>
          (function(c,e,f,k,g,h,b,a,d){c[g]||(c[g]=h,b=c[h]=function(){
          b.q.push(arguments)},b.q=[],b.l=1*new Date,a=e.createElement(f),a.async=1,
          a.src=k,a.setAttribute("crossorigin", "anonymous"),d=e.getElementsByTagName(f)[0],
          d.parentNode.insertBefore(a,d))})(window,document,"script",
          "//eum.instana.io/eum.min.js","InstanaEumObject","ineum");
          ineum('reportingUrl', '${instanaReportingUrl}');
          ineum('key', '${instanaWebsiteKey}');
          ineum('user', '18180505 ', 'karlm', 'karl@iaa.org');
          ineum('page', 'lambda-app/main');
          ineum('meta', 'version', '18640928');
          ineum('whitelistedOrigins', [/.*amazonaws\.com.*/i]);
        </script>
      </head>`;
  }

  let script = '';
  if (lambdaUrl && lambdaUrl.length > 0) {
    script =
      //
      `<script>
         const div = document.getElementById('response');
         div.innerHTML = 'request in progress...';
         setTimeout(() => {
           fetch('${lambdaUrl}')
             .then(response => response.json())
             .then(json => {
               div.innerHTML = '<p>Response:</p><code>' + JSON.stringify(json) + '</code>';
             })
             .catch(err => {
               console.log(err);
               div.innerHTML = '<p>An error occured. See browser console for details.</p><code>' + err + '</code>';
             });
           }, 1000);
       </script>`;
  }

  res.send(
    //
    `<html>
     ${head}
     <body>
       <h1>Demo Page</h1>
       <p>Just stay calm and seize the means of production.</p>

       <h2>AJAX/EUM</h2>
       <div id="response" />

       ${script}
     </body>
     </html>`
  );
});

app.post('/audit-log', (req, res) => {
  const message = req.body.message || 'some random audit log message';

  if (Math.random() > 0.66) {
    // Trigger an error with 1/3 probability. Sales people love errors when demoing stuff.
    return res.sendStatus(500);
  } else {
    return pool
      .query('INSERT INTO audit_log(message) VALUES($1) RETURNING *', [message])
      .then(() => res.sendStatus(201))
      .catch(e => {
        log('Could not write audit log: ', e);
        res.sendStatus(500);
      });
  }
});

const httpModule = process.env.NO_HTTPS ? 'http' : 'https';

// eslint-disable-next-line import/no-dynamic-require
require(httpModule)
  .createServer(
    {
      key: fs.readFileSync(path.join(__dirname, 'key')),
      cert: fs.readFileSync(path.join(__dirname, 'cert'))
    },
    app
  )
  .listen(port, () => {
    log(`Listening for ${httpModule.toUpperCase()} traffic on port: ${port}`);
  });

function log() {
  /* eslint-disable no-console */
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
