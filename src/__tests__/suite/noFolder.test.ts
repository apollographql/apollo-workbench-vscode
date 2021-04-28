import * as assert from 'assert';
import * as vscode from 'vscode';

import { activateExtension } from './helpers';
import { FileProvider } from '../../workbench/file-system/fileProvider';
import { StateManager } from '../../workbench/stateManager';
import { ApolloWorkbenchFile } from '../../workbench/file-system/fileTypes';

suite('No Folder Loaded in Workbnech', () => {
  vscode.window.showInformationMessage('Start all tests.');
  before(activateExtension);
  after(() => {});
});
