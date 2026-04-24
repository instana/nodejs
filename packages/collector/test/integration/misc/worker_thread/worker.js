/*
 * (c) Copyright IBM Corp. 2026
 */

'use strict';

const { parentPort } = require('node:worker_threads');

function generatePDF(filename) {
  const pdfContent = Buffer.from(`PDF content for ${filename}`);

  parentPort.postMessage({
    fileName: filename,
    content: pdfContent
  });
}

parentPort.on('message', task => {
  if (task.action === 'generate') {
    generatePDF(task.filename);
  }
});

parentPort.postMessage({ type: 'worker-ready' });
