import * as assert from 'assert';

import { activateExtension, cleanupWorkbenchFiles } from '.';
import { GettingStartedTopLevel } from '../../workbench/local-workbench-files/gettingStartedTreeItems';
import { StateManager } from '../../workbench/stateManager';

suite('Loaded workbench ', () => {
    before(activateExtension);
    after(cleanupWorkbenchFiles);

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