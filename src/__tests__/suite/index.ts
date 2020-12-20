import * as path from 'path';
import Mocha from 'mocha';
import glob from 'glob';
import * as vscode from 'vscode';
import { readdirSync, unlinkSync } from 'fs';
import { StateManager } from '../../workbench/stateManager';

export const activateExtension = async () => {
    return new Promise<void>(async (resolve) => {
        await vscode.extensions.getExtension('ApolloGraphQL.apollo-workbench-vscode')?.activate();
        resolve();
    });
}

export function cleanupWorkbenchFiles(done) {
    const directory = path.resolve(__dirname, '..', './test-workbench');
    const dirents = readdirSync(directory, { withFileTypes: true });
    for (const dirent of dirents) {
        if (dirent.isFile() && dirent.name.includes('.apollo-workbench'))
            unlinkSync(path.resolve(directory, dirent.name));
    }
    done();
}

export function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: 'tdd'
    });

    const testsRoot = path.resolve(__dirname, '..');
    let isWorkbenchFolderLoaded = StateManager.workspaceRoot ? true : false;

    return new Promise((c, e) => {
        glob('**/**.test.js', { cwd: testsRoot }, (err, files) => {
            if (err) {
                return e(err);
            }

            // Add files to the test suite
            files.forEach(f => {
                if (f.includes('defaults'))
                    mocha.addFile(path.resolve(testsRoot, f))
                else if (isWorkbenchFolderLoaded && !f.includes('noFolder'))
                    mocha.addFile(path.resolve(testsRoot, f))
                else if (!isWorkbenchFolderLoaded && f.includes('noFolder'))
                    mocha.addFile(path.resolve(testsRoot, f))
            });

            try {
                // Run the mocha test
                mocha.ui('bdd').run(failures => {
                    if (failures > 0) {
                        e(new Error(`${failures} tests failed.`));
                    } else {
                        c();
                    }
                });
            } catch (err) {
                console.error(err);
                e(err);
            }
        });
    });
}