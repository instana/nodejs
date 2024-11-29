/*
 * (c) Copyright IBM Corp. 2024
 */
/* eslint-disable no-console */

'use strict';

const fs = require('fs');
const path = require('path');

fs.readFile('website.txt', 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading website.txt:', err);
    return;
  }

  const reportingUrlRegex = /ineum\('reportingUrl',\s*'([^']+)'\);/;
  const keyRegex = /ineum\('key',\s*'([^']+)'\);/;
  const integrityRegex = /integrity=["']([^"']+)["']/;

  const reportingUrlMatch = data.match(reportingUrlRegex);
  const keyMatch = data.match(keyRegex);
  const integrityMatch = data.match(integrityRegex);

  const eumContent = `/* eslint-disable no-undef */
  /* eslint-disable header/header */
  
  'use strict';
  
  (function (s, t, a, n) {
    if (!s[t]) {
      s[t] = a;
      n = s[a] = function () {
        n.q.push(arguments);
      };
      n.q = [];
      n.v = 2;
      n.l = 1 * new Date();
    }
  })(window, 'InstanaEumObject', 'ineum');
  
  // Replace these placeholders with actual values
  ineum('reportingUrl', '${reportingUrlMatch[1] || ''}');
  ineum('key', '${keyMatch[1] || ''}');
  ineum('trackSessions');
  `;

  const sdkContent = `/* eslint-disable no-console */
  /* eslint-disable no-undef */
  /* eslint-disable header/header */
  
  'use strict';
  
  const script = document.createElement('script');
  script.defer = true;
  script.crossOrigin = 'anonymous';
  script.src = 'https://eum.instana.io/1.7.2/eum.min.js';
  script.integrity = '${integrityMatch[1] || ''}';
  
  // Append the script tag to the document's head or body
  document.head.appendChild(script);
  
  // Optional: You can listen to the 'load' event to handle when the script has fully loaded
  script.onload = () => {
    console.log('Script loaded Instana SDK successfully');
  };
  
  script.onerror = () => {
    console.error('Script Instana SDK failed to load');
  };
  `;

  const instanaEumPath = path.join(__dirname, 'public', 'instana-eum.js');
  const instanaSdkPath = path.join(__dirname, 'public', 'instana-sdk.js');

  fs.writeFile(instanaEumPath, eumContent, err => {
    if (err) {
      console.error('Error writing instana-eum.js:', err);
    } else {
      console.log('instana-eum.js file has been created.');
    }
  });

  fs.writeFile(instanaSdkPath, sdkContent, err => {
    if (err) {
      console.error('Error writing instana-sdk.js:', err);
    } else {
      console.log('instana-sdk.js file has been created.');
    }
  });
});
