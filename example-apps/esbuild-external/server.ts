// server.ts
import * as vscode from 'vscode';
import instana from '@instana/serverless-collector';
import axios from 'axios';

export async function runInstanaJob() {
  try {
    vscode.window.showInformationMessage('Start Entry Span.');
    await instana.sdk.async.startEntrySpan('execution-time', 'custom', 'blalba');
    const response = await axios.get('https://jsonplaceholder.typicode.com/posts/1');
    instana.sdk.async.completeEntrySpan();
    vscode.window.showInformationMessage('End Entry Span.');
    console.log(response.data);
  } catch (error) {
    console.error(error);
  }
}
