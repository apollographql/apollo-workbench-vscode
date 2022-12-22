import * as path from 'path';

import { runTests } from '@vscode/test-electron';

async function mainTestRunner(loadFolder = false) {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const testWorkbenchFolder = path.resolve(__dirname, './test-workbench');

    // let shouldLoadWorkbenchFolder = process.argv[2];
    // log('******shouldLoadWorkbenchFolder:' + shouldLoadWorkbenchFolder);

    // log('******extensionDevelopmentPath:' + extensionDevelopmentPath);
    // log('******extensionTestsPath:' + extensionTestsPath);
    // log('******testWorkbenchFolder:' + testWorkbenchFolder);

    if (loadFolder)
      await runTests({
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs: [testWorkbenchFolder, '--disable-extensions'],
      });
    else
      await runTests({
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs: ['--disable-extensions'],
      });
  } catch (err) {
    console.error('Failed to run tests');
    process.exit(1);
  }
}

mainTestRunner();
