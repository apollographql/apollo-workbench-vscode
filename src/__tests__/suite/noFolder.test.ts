import * as vscode from 'vscode';

import { activateExtension } from './helpers';

suite('No Folder Loaded in Workbnech', () => {
  vscode.window.showInformationMessage('Start all tests.');
  before(activateExtension);
  after(() => undefined);
});
