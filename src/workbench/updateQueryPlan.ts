import * as vscode from 'vscode';
import { writeFileSync, readFileSync } from "fs";

import { gql } from 'apollo-server';
import { getQueryPlanner } from '@apollo/query-planner-wasm';
import { buildOperationContext, buildQueryPlan, serializeQueryPlan } from '@apollo/gateway';

import { getComposedSchemaLogCompositionErrors } from './setup';
import { getSelectedWorkbenchFile, saveSelectedWorkbenchFile } from "../helpers";

export function updateQueryPlan(path: string, context?: vscode.ExtensionContext) {
    if (path && path.includes('.graphql')) {
        let workbenchFile = getSelectedWorkbenchFile(context);
        if (workbenchFile) {
            let destructured = path.split('/');
            let operationName = destructured[destructured.length - 1].slice(0, -8);
            let operation = readFileSync(path, { encoding: 'utf-8' });
            workbenchFile.operations[operationName] = operation;

            //Generate query plan
            try {
                const { schema, composedSdl } = getComposedSchemaLogCompositionErrors(workbenchFile);
                if (schema && composedSdl) {
                    const queryPlanPointer = getQueryPlanner(composedSdl);
                    const operationContext = buildOperationContext({
                        schema: schema,
                        operationDocument: gql(operation),
                        operationString: operation,
                        queryPlannerPointer: queryPlanPointer,
                        operationName: operationName,
                    });

                    let queryPlan = buildQueryPlan(operationContext);
                    workbenchFile.queryPlans[operationName] = serializeQueryPlan(queryPlan);

                    //write queryPlan
                    let queryPlanPath = `${path.slice(0, path.length - 8)}.queryplan`;
                    writeFileSync(queryPlanPath, workbenchFile.queryPlans[operationName], { encoding: 'utf-8' });
                }
            } catch (err) {
                console.log(err);
                console.log("You probably don't have a valid query defined, see query/query-errors.json for more details");
            }


            saveSelectedWorkbenchFile(workbenchFile, context);
        }
    }
}