import { notDeepEqual } from 'assert';
import { existsSync } from 'fs';
import * as path from 'path';

import { runTests } from 'vscode-test';

async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // The path to the extension test script
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, './suite/index');
        const testWorkbenchFolder = path.resolve(__dirname, './test-workbench');

        let shouldLoadWorkbenchFolder = process.argv[2];
        console.log('******' + shouldLoadWorkbenchFolder);

        if (shouldLoadWorkbenchFolder)
            await runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs: [testWorkbenchFolder] });
        else
            await runTests({ extensionDevelopmentPath, extensionTestsPath });
    } catch (err) {
        console.error('Failed to run tests');
        process.exit(1);
    }
}

main();