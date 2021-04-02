import * as assert from 'assert';
import { suite, it } from 'mocha'
import { activateExtension, cleanupWorkbenchFiles, createAndLoadEmptyWorkbenchFile, simpleSchema } from './helpers';
import { FileProvider } from '../../workbench/file-system/fileProvider';
import { StateManager } from '../../workbench/stateManager';
import { WorkbenchUri, WorkbenchUriType } from '../../workbench/file-system/WorkbenchUri';

const key = 'Loaded-Folder';

suite(key, () => {
    before(activateExtension);
    afterEach(cleanupWorkbenchFiles);


})