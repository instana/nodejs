import * as vscode from 'vscode';
import { runInstanaJob } from './server';

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "instana-axios-demo" is now active!');

  const disposable = vscode.commands.registerCommand('instanaAxiosDemo.run', async () => {
    vscode.window.showInformationMessage('Running Instana Axios Job...');
    vscode.window.showInformationMessage(process.env.NODE_OPTIONS);
    vscode.window.showInformationMessage(process.env.INSTANA_ENDPOINT);
    await runInstanaJob();
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {
  console.log('Extension "instana-axios-demo" is now deactivated.');
}
