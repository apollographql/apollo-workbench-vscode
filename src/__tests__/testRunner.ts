import * as path from 'path';

import { runTests } from '@vscode/test-electron';

//Function for running the tests
//  @param `loadFolder` will load the testing folder and run the associated tests
//      default: No folder will be opened and default tests will be ran
export async function testRunner(loadFolder = false) {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const testWorkbenchFolder = path.resolve(__dirname, './test-workbench');

    let testResults = 1;
    if (loadFolder)
      testResults = await runTests({
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs: [testWorkbenchFolder],
      });
    else
      testResults = await runTests({
        extensionDevelopmentPath,
        extensionTestsPath
      });

    return testResults;
  } catch (err) {
    console.error(err);
    console.error('Failed to run tests');
    process.exit(1);
  }
}
