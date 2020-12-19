import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { FileProvider } from '../../utils/files/fileProvider';
import { GettingStartedTopLevel } from '../../workbench/local-workbench-files/gettingStartedTreeItems';
import { StateManager } from '../../workbench/stateManager';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');
    before(async () => {
        return new Promise(async (resolve) => {
            await vscode.extensions.getExtension('ApolloGraphQL.apollo-workbench-vscode')?.activate();
            resolve();
        });
    });
    after(() => {

    })

    it('LocalWorkbenchFiles - Getting Started is displayed by default', async () => {
        return new Promise(async (resolve) => {
            const localWorkbenchTreeItems = await StateManager.instance.localWorkbenchFilesProvider.getChildren();

            //Ensure only 1 item is in the tree by default
            assert.ok(localWorkbenchTreeItems.length == 1);

            //Ensure the 1 tree item is the GettingStartedTopLevel
            const gettingStart = localWorkbenchTreeItems[0] as GettingStartedTopLevel;
            assert.ok(gettingStart);

            resolve();
        });
    });
});