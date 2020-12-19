import * as assert from 'assert';
import * as vscode from 'vscode';

import { activateExtension } from '.';
import { GettingStartedTopLevel } from '../../workbench/local-workbench-files/gettingStartedTreeItems';
import { StateManager } from '../../workbench/stateManager';
import { NotLoggedInTreeItem } from '../../workbench/studio-graphs/apolloStudioGraphsTreeDataProvider';

suite('Default Workbench Tests', () => {
    before(activateExtension);

    it('Defaults:LocalWorkbenchFiles - Getting Started is displayed', async () => {
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
    it('Defaults:WorkbenchSchemaFiles - Should display no workbench file selected', async () => {
        return new Promise(async (resolve) => {
            const currentWorkbenchSchemasTreeItems = await StateManager.instance.currentWorkbenchSchemasProvider.getChildren();

            assert.ok(currentWorkbenchSchemasTreeItems.length == 1);
            assert.ok(currentWorkbenchSchemasTreeItems[0]?.label == 'No workbench file selected');

            resolve();
        });
    });
    it('Defaults:WorkbenchQueryFiles - Should display no workbench file selected', async () => {
        return new Promise(async (resolve) => {
            const currentWorkbenchOperationsTreeItems = await StateManager.instance.currentWorkbenchOperationsProvider.getChildren();

            assert.ok(currentWorkbenchOperationsTreeItems.length == 1);
            assert.ok(currentWorkbenchOperationsTreeItems[0]?.label == 'No workbench file selected');

            resolve();
        });
    });
    it('Defaults:StudioGraphs - Should display login item', async () => {
        return new Promise(async (resolve) => {
            const studioGraphTreeItems = await StateManager.instance.apolloStudioGraphsProvider.getChildren();
            studioGraphTreeItems.forEach(studioGraphTreeItem => assert.ok(studioGraphTreeItem as NotLoggedInTreeItem));
            resolve();
        });
    });
    it('Defaults:StudioOperations - Should display login item', async () => {
        return new Promise(async (resolve) => {
            const studioGraphTreeItems = await StateManager.instance.apolloStudioGraphsProvider.getChildren();
            studioGraphTreeItems.forEach(studioGraphTreeItem => assert.ok(studioGraphTreeItem as NotLoggedInTreeItem));
            resolve();
        });
    });
});