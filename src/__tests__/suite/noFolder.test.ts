import * as vscode from 'vscode';
import { suite, after, before } from 'mocha';

import { activateExtension } from './helpers';

suite('No Folder Loaded in Workbnech', () => {
  vscode.window.showInformationMessage('Start all tests.');
  before(activateExtension);
  after(() => undefined);
});
