import * as vscode from 'vscode';
import { writeFileSync, readFileSync } from "fs";

import { gql } from 'apollo-server';
import { getQueryPlan, getQueryPlanner } from '@apollo/query-planner-wasm';
import { serializeQueryPlan } from '@apollo/gateway';

import { FileWatchManager } from './fileWatchManager';
import { StateManager } from './stateManager';
import { ServerManager } from './serverManager';
import { WorkbenchFileManager } from './workbenchFileManager';

export function updateQueryPlan(path: string) {
    if (path && path.includes('.graphql')) {
        let workbenchFile = WorkbenchFileManager.getSelectedWorkbenchFile();
        if (workbenchFile) {
            let destructured = path.split('/');
            let operationName = destructured[destructured.length - 1].slice(0, -8);
            let operation = readFileSync(path, { encoding: 'utf-8' });

            if (workbenchFile.operations[operationName] != operation || !workbenchFile.queryPlans[operationName]) {
                workbenchFile.operations[operationName] = operation;

                //Generate query plan
                try {
                    const { composedSdl } = ServerManager.instance.getComposedSchema(workbenchFile);
                    if (composedSdl) {
                        const queryPlanPointer = getQueryPlanner(composedSdl);
                        let queryPlan = getQueryPlan(queryPlanPointer, operation, { autoFragmentization: false });
                        workbenchFile.queryPlans[operationName] = serializeQueryPlan(queryPlan);

                        //write queryPlan
                        let queryPlanPath = `${path.slice(0, path.length - 8)}.queryplan`;
                        writeFileSync(queryPlanPath, workbenchFile.queryPlans[operationName], { encoding: 'utf-8' });
                        WorkbenchFileManager.saveSelectedWorkbenchFile(workbenchFile);
                    }
                } catch (err) {
                    console.log(err);
                    console.log("You probably don't have a valid query defined, see query/query-errors.json for more details");
                    workbenchFile.queryPlans[operationName] = "";
                }

                WorkbenchFileManager.saveSelectedWorkbenchFile(workbenchFile);
            }
        }
    }
}