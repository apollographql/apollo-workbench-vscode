import * as assert from 'assert';
import * as vscode from 'vscode';

import { activateExtension } from './helpers';
import { FileProvider } from '../../utils/files/fileProvider';
import { GettingStartedTopLevel } from '../../workbench/local-workbench-files/gettingStartedTreeItems';
import { StateManager } from '../../workbench/stateManager';

suite('No Folder Loaded in Workbnech', () => {
    vscode.window.showInformationMessage('Start all tests.');
    before(activateExtension);
    after(() => {

    })

    it('Unable to create workbench file with FileProvider.createNewWorkbenchFile', async function () {
        //Setup - Try creating a new file with no folder open
        FileProvider.instance.createNewWorkbenchFile('test-create-file');

        //Get TreeView children
        const localWorkbenchTreeItems = await StateManager.instance.localWorkbenchFilesProvider.getChildren();

        //Ensure only getting started is in the tree
        assert.strictEqual(localWorkbenchTreeItems.length, 1);
        assert.notStrictEqual(localWorkbenchTreeItems[0] as GettingStartedTopLevel, undefined);
    });
});