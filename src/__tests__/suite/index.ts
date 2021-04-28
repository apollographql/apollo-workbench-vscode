import * as path from 'path';
import Mocha from 'mocha';
import glob from 'glob';
import { StateManager } from '../../workbench/stateManager';

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
  });

  const testsRoot = path.resolve(__dirname, '..');
  const isWorkbenchFolderLoaded = StateManager.workspaceRoot ? true : false;

  return new Promise((c, e) => {
    glob('**/**.test.js', { cwd: testsRoot }, (err, files) => {
      if (err) {
        return e(err);
      }

      // Add files to the test suite
      files.forEach((f) => {
        if (f.includes('defaults')) mocha.addFile(path.resolve(testsRoot, f));
        else if (isWorkbenchFolderLoaded && !f.includes('noFolder'))
          mocha.addFile(path.resolve(testsRoot, f));
        else if (!isWorkbenchFolderLoaded && f.includes('noFolder'))
          mocha.addFile(path.resolve(testsRoot, f));
      });

      try {
        // Run the mocha test
        mocha.run((failures) => {
          if (failures > 0) {
            e(new Error(`${failures} tests failed.`));
          } else {
            c();
          }
        });
      } catch (err) {
        console.error(`Mocha Run Error: ${err}`);
        e(err);
      }
    });
  });
}
