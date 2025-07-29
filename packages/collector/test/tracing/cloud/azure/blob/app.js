/*
 * (c) Copyright IBM Corp. 2024
 */

/* eslint-disable no-console */

'use strict';

require('./mockVersion');

require('@instana/core/test/test_util/loadExpressV4');

require('../../../../..')();

const { BlobServiceClient, BlobBatchClient, BlobClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
const express = require('express');
const bodyParser = require('body-parser');
const port = require('../../../../test_util/app-port')();
const agentPort = process.env.INSTANA_AGENT_PORT;
const app = express();
const logPrefix = `Express / azure blob App (${process.pid}):\t`;
const fs = require('fs');
const fetch = require('node-fetch-v2');
const filePath = `${__dirname}/sample.pdf`;
const localFilePath = `${__dirname}/out.pdf`;
const binaryData = fs.readFileSync(filePath);
const azureAccountKey = process.env.AZURE_ACCOUNT_KEY;
const connectionString = process.env.AZURE_CONNECTION_STRING;
const azureStorageAccount = process.env.AZURE_STORAGE_ACCOUNT;

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const containerName = process.env.AZURE_CONTAINER_NAME;
const blobName = 'first.pdf';
const containerClient = blobServiceClient.getContainerClient(containerName);
const cred = new StorageSharedKeyCredential(azureStorageAccount, azureAccountKey);
const encodedData = Buffer.from(binaryData.toString('base64'), 'base64');
const blockBlobClient = containerClient.getBlockBlobClient(blobName);

const uploadDocumentToAzure = async (options = {}) => {
  try {
    const opts = {
      blobHTTPHeaders: {
        blobContentType: 'application/pdf'
      }
    };
    if (options.maxSingleShotSize) {
      opts.maxSingleShotSize = options.maxSingleShotSize;
    }
    const response = await blockBlobClient.uploadData(encodedData, opts);
    if (response._response.status !== 201) {
      throw new Error(`Error uploading document ${blockBlobClient.name} to container ${blockBlobClient.containerName}`);
    }
  } catch (e) {
    log('err:', e);
  }
};

const deleteDocumentFromAzure = async _blobName => {
  const response = await containerClient.deleteBlob(_blobName);
  if (response._response.status !== 202) {
    throw new Error(`Error deleting ${_blobName}`);
  }
  return response;
};

const download = async _blobName => {
  const _blockBlobClient = containerClient.getBlockBlobClient(_blobName);
  try {
    const downloadBlobResponse = await _blockBlobClient.downloadToFile(localFilePath);
    return downloadBlobResponse;
  } catch (e) {
    log('Error occured while downloading');
  }
};

const streamToString = async readableStream => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', _data => {
      chunks.push(_data);
    });
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks).toString('base64'));
    });
    readableStream.on('error', reject);
  });
};

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.sendStatus(200);
});

app.get('/download', async (req, res) => {
  try {
    await uploadDocumentToAzure();
    await download(blobName);
    fs.unlinkSync(localFilePath);
    await deleteDocumentFromAzure(blobName);
    res.send();
  } catch (e) {
    log('Error in /download:', e);
    res.send();
  }
});

app.get('/download-buffer', async (req, res) => {
  try {
    await uploadDocumentToAzure();
    const response = await blockBlobClient.downloadToBuffer();
    fs.writeFileSync(localFilePath, response);
    fs.unlinkSync(localFilePath);
    await deleteDocumentFromAzure(blobName);
    res.send();
  } catch (e) {
    log('Error in /download-buffer:', e);
    res.send();
  }
});

app.get('/download-buffer-promise', (req, res) => {
  uploadDocumentToAzure()
    .then(() => blockBlobClient.downloadToBuffer())
    .then(response => {
      fs.writeFileSync(localFilePath, response);
      return fs.unlinkSync(localFilePath);
    })
    .then(() => deleteDocumentFromAzure(blobName))
    .then(() => res.send())
    .catch(error => {
      log(`Error downloading blob: ${error.message}`);
      res.send();
    });
});

app.get('/download-await', async (req, res) => {
  try {
    await uploadDocumentToAzure();
    const response = await blockBlobClient.download(0);
    if (response.readableStreamBody) {
      await streamToString(response.readableStreamBody);
      await deleteDocumentFromAzure(blobName);
      res.send();
    } else {
      await deleteDocumentFromAzure(blobName);
      log(`Error downloading document ${blockBlobClient.name} from container ${blockBlobClient.containerName}`);
      res.send();
    }
  } catch (e) {
    log('Error in /download-await:', e);
    res.send();
  }
});

app.get('/download-blockblob-promise', async (req, res) => {
  try {
    await uploadDocumentToAzure();
    blockBlobClient
      .download()
      .then(async downloadBlobResponse => {
        const readableStream = downloadBlobResponse.readableStreamBody;
        const chunks = [];

        readableStream.on('data', chunk => {
          chunks.push(chunk);
        });

        readableStream.on('end', () => {
          Buffer.concat(chunks);
        });
        await deleteDocumentFromAzure(blobName);
        res.send();
      })
      .catch(error => {
        log('Error downloading blob:', error.message);
      });
  } catch (e) {
    log('Error in /download-blockblob-promise:', e);
    res.send();
  }
});

app.get('/download-promise', async (req, res) => {
  try {
    await uploadDocumentToAzure();
    blockBlobClient
      .downloadToFile(localFilePath)
      .then(async () => {
        fs.unlinkSync(localFilePath);
        await deleteDocumentFromAzure(blobName);
        res.send();
      })
      .catch(error => {
        log(`Error downloading blob: ${error.message}`);
      });
  } catch (e) {
    log('Error in /download-promise:', e);
    res.send();
  }
});

app.get('/download-promise-err', async (req, res) => {
  try {
    blockBlobClient
      .downloadToFile(localFilePath)
      .then(async () => {
        fs.unlinkSync(localFilePath);
        await deleteDocumentFromAzure(blobName);
        res.send();
      })
      .catch(error => {
        log('Error downloading blob');
        res.send(error);
      });
  } catch (e) {
    res.send();
  }
});

app.get('/download-err', async (req, res) => {
  try {
    await uploadDocumentToAzure();
    await download('unknown');
    await deleteDocumentFromAzure(blobName);
    res.send();
  } catch (e) {
    res.send();
  }
});

app.get('/uploadDataBlock', async (req, res) => {
  const resp = await uploadDocumentToAzure({ maxSingleShotSize: 1 * 1024 });
  res.send(resp);
});

app.get('/uploadData', async (req, res) => {
  try {
    await uploadDocumentToAzure();
    await deleteDocumentFromAzure(blobName);
    res.send();
  } catch (e) {
    res.send();
  }
});

app.get('/upload', async (req, res) => {
  const pdfData = fs.readFileSync(filePath);
  blockBlobClient
    .upload(pdfData, pdfData.length)
    .then(() => {
      fetch(`http://127.0.0.1:${agentPort}`).then(() => {
        res.json('success');
      });
    })
    .catch(error => {
      log('Failed to upload PDF file:', error);
      res.send();
    });
});

app.get('/upload-err', async (req, res) => {
  const pdfData = fs.readFileSync(filePath);
  blockBlobClient
    .upload(pdfData)
    .then(() => {
      res.send('success');
    })
    .catch(error => {
      res.send(error);
    });
});

app.get('/uploadData-delete-blobBatch-blobUri', async (req, res) => {
  try {
    await uploadDocumentToAzure();
    const blobBatchClient = new BlobBatchClient(`https://${azureStorageAccount}.blob.core.windows.net`, cred);
    await blobBatchClient.deleteBlobs(
      [`https://${azureStorageAccount}.blob.core.windows.net/${containerName}/${blobName}`],
      cred
    );
    res.send();
  } catch (e) {
    res.send();
  }
});

app.get('/uploadData-delete-blobBatch-blobClient', async (req, res) => {
  try {
    await uploadDocumentToAzure();
    const blobClient = new BlobClient(connectionString, containerName, blobName);
    const blobBatchClient = new BlobBatchClient(`https://${azureStorageAccount}.blob.core.windows.net`, cred);
    await blobBatchClient.deleteBlobs([blobClient], cred);
    res.send();
  } catch (e) {
    res.send();
  }
});

app.get('/deleteError', async (req, res) => {
  try {
    containerClient
      .deleteBlob(blobName)
      .then(() => {
        res.send();
      })
      .catch(error => {
        log('Error deleting blob:', error.message);
        res.send();
      });
  } catch (e) {
    res.send();
  }
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
