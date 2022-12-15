import * as assert from 'assert';
import { suite, it } from 'mocha';
import {
  activateExtension,
  cleanupWorkbenchFiles,
} from './helpers';

const key = 'Loaded-Folder';

suite(key, () => {
  before(activateExtension);
  afterEach(cleanupWorkbenchFiles);
});
