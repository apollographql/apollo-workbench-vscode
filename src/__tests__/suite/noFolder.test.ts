import * as assert from 'assert';
import * as vscode from 'vscode';

import { activateExtension } from '.';
import { FileProvider } from '../../utils/files/fileProvider';
import { GettingStartedTopLevel } from '../../workbench/local-workbench-files/gettingStartedTreeItems';
import { StateManager } from '../../workbench/stateManager';

suite('No Folder Loaded in Workbnech', () => {
    vscode.window.showInformationMessage('Start all tests.');
    before(activateExtension);
    after(() => {

    })

    it('Unable to create workbench file with FileProvider.createNewWorkbenchFile', async () => {
        return new Promise(async (resolve) => {
            FileProvider.instance.createNewWorkbenchFile('test-create-file');
            const localWorkbenchTreeItems = await StateManager.instance.localWorkbenchFilesProvider.getChildren();

            //Ensure only getting started is in the tree
            assert.ok(localWorkbenchTreeItems.length == 1);
            assert.ok(localWorkbenchTreeItems[0] as GettingStartedTopLevel);

            resolve();
        });
    });
});