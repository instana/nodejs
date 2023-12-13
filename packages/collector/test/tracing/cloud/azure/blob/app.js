/*
 * (c) Copyright IBM Corp. 2021
 * (c) Copyright Instana Inc. and contributors 2018
 */

/* eslint-disable no-console */

'use strict';

// const agentPort = process.env.INSTANA_AGENT_PORT;

require('../../../../..')();

const { BlobServiceClient, BlobBatchClient, BlobClient, StorageSharedKeyCredential } = require('@azure/storage-blob');

const express = require('express');
// const morgan = require('morgan');
// const request = require('request-promise-native');
const bodyParser = require('body-parser');
const port = require('../../../../test_util/app-port')();

const app = express();
const logPrefix = `Express / azure blob App (${process.pid}):\t`;
const fs = require('fs');

const filePath = `${__dirname}/sam.pdf`;
const localFilePath = `${__dirname}/out.pdf`;
const data1 = fs.readFileSync(filePath);
const accountKey = process.env.ACC_KEY;
const connStr = process.env.CONN_STR;
const storageAccount = process.env.STORAGE_ACC;

const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
const containerName = process.env.CONTAINER_NAME;
const blobName = 'first.pdf';
const containerClient = blobServiceClient.getContainerClient(
  containerName
);
const cred = new StorageSharedKeyCredential(storageAccount, accountKey);
const data = Buffer.from(data1.toString('base64'), 'base64');
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
    const response = await blockBlobClient.uploadData(data, opts);
    if (response._response.status !== 201) {
      throw new Error(
        `Error uploading document ${blockBlobClient.name} to container ${blockBlobClient.containerName}`
      );
    } else {
      console.log('uploaded successsfully');
      return ('uploaded successsfully');
    }
  } catch (e) {
    console.log('err:', e);
  }
};

const deleteDocumentFromAzure = async (_blobName) => {
  const response = await containerClient.deleteBlob(_blobName);
  if (response._response.status === 202) {
    console.log(`Deleted ${_blobName}`);
  }
  if (response._response.status !== 202) {
    throw new Error(`Error deleting ${_blobName}`);
  }
  return response;
};

const download = async (_blobName) => {
  const _blockBlobClient = containerClient.getBlockBlobClient(_blobName);
  try {
    const downloadBlobResponse = await _blockBlobClient.downloadToFile(localFilePath);
    console.log(`Downloaded blob to ${localFilePath}:`);
    return downloadBlobResponse;
  } catch (e) {
    console.log('Error occured while downloading:', e);
  }
};

const streamToString = async (
  readableStream
) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', (_data) => {
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
    console.log('Error in /download:', e);
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
    console.log('Error in /download-buffer:', e);
    res.send();
  }
});

app.get('/download-buffer-promise', async (req, res) => {
  try {
    await uploadDocumentToAzure();
    blockBlobClient.downloadToBuffer().then(response => {
      fs.writeFileSync(localFilePath, response);
      fs.unlinkSync(localFilePath);
    }).catch(error => {
      console.error(`Error downloading blob: ${error.message}`);
    });
    await deleteDocumentFromAzure(blobName);
    res.send();
  } catch (e) {
    console.log('Error in /download-buffer-promise:', e);
    res.send();
  }
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
      console.log(
        `Error downloading document ${blockBlobClient.name} from container ${blockBlobClient.containerName}`
      );
      res.send();
    }
  } catch (e) {
    console.log('Error in /download-await:', e);
    res.send();
  }
});

app.get('/download-blockblob-promise', async (req, res) => {
  try {
    await uploadDocumentToAzure();
  blockBlobClient.download()
  .then(async (downloadBlobResponse) => {
    const readableStream = downloadBlobResponse.readableStreamBody;
    const chunks = [];

    readableStream.on('data', (chunk) => {
      chunks.push(chunk);
    });

    readableStream.on('end', () => {
      Buffer.concat(chunks);
      console.log('Downloaded blob content');
    });
        await deleteDocumentFromAzure(blobName);
        res.send();
  })
  .catch((error) => {
    console.error('Error downloading blob:', error.message);
  });
  } catch (e) {
    console.log('Error in /download-blockblob-promise:', e);
    res.send();
  }
});

app.get('/download-promise', async (req, res) => {
  try {
    await uploadDocumentToAzure();
    blockBlobClient.downloadToFile(localFilePath)
      .then(async () => {
        console.log(`Downloaded blob to ${localFilePath}`);
        fs.unlinkSync(localFilePath);
        await deleteDocumentFromAzure(blobName);
        res.send();
      })
      .catch(error => {
        console.error(`Error downloading blob: ${error.message}`);
      });
  } catch (e) {
    console.log('Error in /download-promise:', e);
    res.send();
  }
});

app.get('/download-promise-err', async (req, res) => {
  try {
    blockBlobClient.downloadToFile(localFilePath)
      .then(async () => {
        console.log(`Downloaded blob to ${localFilePath}`);
        fs.unlinkSync(localFilePath);
        await deleteDocumentFromAzure(blobName);
        res.send();
      })
      .catch(error => {
        console.log(`Error downloading blob: ${error.message}`);
        res.send();
      });
  } catch (e) {
    console.log('Error in /download-promise-err:', e);
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
    console.log('Error in /download-err:', e);
    res.send();
  }
});

app.get('/uploadDataBlock', async (req, res) => {
  const resp = await uploadDocumentToAzure({ maxSingleShotSize: 3 * 1024 });
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
app.get('/uploadData-delete-blobBatch-blobUri', async (req, res) => {
  try {
    await uploadDocumentToAzure();
    const blobBatchClient = new BlobBatchClient(`https://${storageAccount}.blob.core.windows.net`, cred);
    await blobBatchClient.deleteBlobs(
      [`https://${storageAccount}.blob.core.windows.net/${containerName}/${blobName}`], cred);
    res.send();
  } catch (e) {
    res.send();
  }
});

app.get('/uploadData-delete-blobBatch-blobClient', async (req, res) => {
  try {
    await uploadDocumentToAzure();
    const blobClient = new BlobClient(connStr, containerName, blobName);
    const blobBatchClient = new BlobBatchClient(`https://${storageAccount}.blob.core.windows.net`, cred);
    await blobBatchClient.deleteBlobs([blobClient], cred);
    res.send();
  } catch (e) {
    res.send();
  }
});

app.get('/deleteError', async (req, res) => {
  try {
    await uploadDocumentToAzure();
    await deleteDocumentFromAzure(blobName);
    containerClient.deleteBlob(blobName)
      .then(() => {
        console.log('Blob deleted successfully.');
        res.send();
      })
      .catch(error => {
        console.error('Error deleting blob:', error.message);
        res.send();
      });
  } catch (e) {
    res.send();
  }
});

app.get('/upload', async (req, res) => {
  const pdfData = fs.readFileSync(filePath);
  blockBlobClient.upload(pdfData, pdfData.length)
    .then(() => {
      console.log('PDF file uploaded successfully.');
      res.send('successss');
    })
    .catch((error) => {
      console.error('Failed to upload PDF file:', error);
      res.send();
    });
});

app.get('/upload-err', async (req, res) => {
  const pdfData = fs.readFileSync(filePath);
  blockBlobClient.upload(pdfData)
    .then(() => {
      console.log('PDF file uploaded successfully.');
      res.send('successss');
    })
    .catch((error) => {
      console.error('Failed to upload PDF file:', error);
      res.send();
    });
});

app.listen(port, () => {
  log(`Listening on port: ${port}`);
});

function log() {
  const args = Array.prototype.slice.call(arguments);
  args[0] = logPrefix + args[0];
  console.log.apply(console, args);
}
