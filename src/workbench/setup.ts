import { writePortMapping, workspaceSchemasFolderPath, getWorkbenchFile, saveWorkbenchFile, getPortMapping, getSelectedWorkbenchFile, saveSelectedWorkbenchFile, getLocalSchemaFromFile } from "../helpers";
import * as vscode from 'vscode';
import { gql, ApolloServer } from "apollo-server";
import { buildFederatedSchema, composeAndValidate, printSchema } from '@apollo/federation';
import { ApolloWorkbench, compositionDiagnostics, outputChannel } from "../extension";

import { OverrideApolloGateway } from '../gateway';
import { buildSchema, parseValue, TypeInfo, visit, visitWithTypeInfo } from "graphql";

let isReady = false;
let serversState: any = {};
export let portMapping = {};

export const setupMocks = (context: vscode.ExtensionContext) => {
    let workbenchFile = getSelectedWorkbenchFile(context);
    if (workbenchFile) {
        let port = 4000;
        while (serversState[port])
            port++;

        for (var key in workbenchFile.schemas) {
            let serviceName = key;

            console.log(`Attemping to start server: ${serviceName}`);

            startServer(serviceName);
            console.log(`Running at port ${port}`);

            port++;
        }

        startGateway();
        getComposedSchemaLogCompositionErrors(workbenchFile);
    }
}

export function stopMocks() {
    if (serversState?.gateway)
        serversState.gateway.experimental_pollInterval = 10000000;

    for (var key in serversState) {
        if (key != 'gateway') {
            outputChannel.append(`Stopping server running at port ${key}...`);
            isReady = false;
            serversState[key].stop();
            delete serversState[key];
            delete portMapping[key];

            outputChannel.appendLine(`complete.`);
        }
    }
}

export function startGateway() {
    if (serversState[4000]) {
        outputChannel.append(`Stopping previous running gateway...`);
        isReady = false;
        serversState[4000].stop();
        delete serversState[4000];
        console.log(`complete.`);
    }

    console.log(`Starting gateway`);

    //We always have a gateway running in the background and change it's pollInterval when not in use
    //This is a workaround because `server.stop()` doesn't stop that polling and becomes a memory leak if releasing the serer
    if (!serversState['gateway']) serversState['gateway'] = new OverrideApolloGateway({ debug: true });
    else serversState['gateway'].experimental_pollInterval = 10000;

    const server = new ApolloServer({
        gateway: serversState['gateway'],
        subscriptions: false,
        engine: {
            apiKey: process.env.APOLLO_KEY || ""
        }
    });

    const port = process.env.PORT || 4000;
    server.listen({ port }).then(({ url }) => {
        console.log(`🚀 Mocked Gateway ready at ${url}`);
    });

    serversState[4000] = server;
    isReady = true;
}

function getNextAvailablePort() {
    let port = 4001;
    while (serversState[port])
        port++;

    return port;
}

export function startServer(serviceName: string) {
    const port = portMapping[serviceName] ?? getNextAvailablePort();

    if (serversState[port]) {
        console.log(`Stoppiing previous running server at port: ${port}`);
        serversState[port].stop();
        delete serversState[port];
    }

    try {
        const schemaString = getLocalSchemaFromFile(serviceName);
        if (schemaString == '') {
            outputChannel.appendLine(`No schema defined for ${serviceName} service.`)
            return;
        }

        const typeDefs = gql(schemaString);
        const server = new ApolloServer({
            schema: buildFederatedSchema(typeDefs),
            mocks: true,
            mockEntireSchema: false,
            engine: false,
            subscriptions: false
        });
        server.listen({ port }).then(({ url }) => console.log(`🚀 ${serviceName} mocked server ready at ${url}`));

        serversState[port] = server;
        portMapping[serviceName] = port;

    } catch (err) {
        if (err.message.includes('EOF')) {
            console.log(`${serviceName} has no contents, try defining a schema`);
        } else {
            console.log(`${serviceName} has composition errors - ${err}`);
        }
    }
}

export function stopServer(serviceName) {
    let port = portMapping[serviceName];
    serversState[port].stop();
    delete serversState[port];
    delete portMapping[serviceName];
}

export function updateSchema(path: string, context: vscode.ExtensionContext, compositionDiagnostics: vscode.DiagnosticCollection) {
    if (!path || !path.includes('.graphql') || path == '.graphql') return;

    let selectedWbFile = context.workspaceState.get('selectedWbFile');
    let workbenchFile = getWorkbenchFile((selectedWbFile as any)?.path);

    let port = 0;
    let portMapping = getPortMapping();
    let path1 = path.split('.graphql')[0];
    let path2 = path1.split('/');
    let serviceName = path2[path2.length - 1];

    console.log(`Setting up ${serviceName}`);

    let localSchemaString = getLocalSchemaFromFile(serviceName);
    workbenchFile.schemas[serviceName] = localSchemaString;

    for (var key in portMapping) {
        if (key == serviceName) {
            port = portMapping[key];
        }
    }

    if (port > 0) {
        startServer(serviceName);
        startGateway();
    }

    writePortMapping(portMapping);
    saveWorkbenchFile(workbenchFile, (selectedWbFile as any)?.path);
    getComposedSchemaLogCompositionErrors(workbenchFile);
}


export function getComposedSchemaLogCompositionErrors(workbenchFile: ApolloWorkbench) {
    let sdls: any = [];

    try {
        for (var key in workbenchFile.schemas) {
            let localSchemaString = getLocalSchemaFromFile(key);
            sdls.push({ name: key, typeDefs: gql(localSchemaString) });
        }

        const { schema, errors, composedSdl } = composeAndValidate(sdls);
        if (errors.length > 0) {
            console.log('Composition Errors Found:');
            compositionDiagnostics.clear();

            let diagnosticsGroups = handleCompositionErrors(workbenchFile, errors);
            for (var serviceName in diagnosticsGroups) {
                compositionDiagnostics.set(vscode.Uri.file(`${workspaceSchemasFolderPath()}/${serviceName}.graphql`), diagnosticsGroups[serviceName]);
            }
        } else
            compositionDiagnostics.clear();

        return { schema, composedSdl };
    }
    catch (err) {
        console.log(`${err}`);
    }

    return { schema: undefined, composedSdl: undefined };
}

function handleCompositionErrors(wb: ApolloWorkbench, errors) {
    let schemas = wb.schemas;
    let diagnosticsGroups: { [key: string]: vscode.Diagnostic[]; } = {};
    errors.map(err => {
        if (err.extensions) {
            let errorCode = err.extensions.code;
            let errSplit = err.message.split('] ');
            let serviceName = errSplit[0].substring(1);

            if (errorCode) {
                if (errorCode === 'EXECUTABLE_DIRECTIVES_IN_ALL_SERVICES') {
                    let services = err.message.split(':')[1].split(',');
                    // const lastServiceName = (services[services.length - 1] as string).substring(0, services.length - 1);
                    // services[services.length - 1] = lastServiceName;
                    services.map(service => {
                        let sn = service.includes('.') ? service.substring(1, service.length - 1) : service.substring(1, service.length);
                        if (!diagnosticsGroups[sn])
                            diagnosticsGroups[sn] = new Array<vscode.Diagnostic>();
                        diagnosticsGroups[sn].push(new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), err.message, vscode.DiagnosticSeverity.Error));
                    });
                } else {
                    if (!diagnosticsGroups[serviceName])
                        diagnosticsGroups[serviceName] = new Array<vscode.Diagnostic>();
                    diagnosticsGroups[serviceName].push(new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), err.message, vscode.DiagnosticSeverity.Error));
                }
            } else {
                if (!diagnosticsGroups["workbench"])
                    diagnosticsGroups["workbench"] = new Array<vscode.Diagnostic>();
                diagnosticsGroups["workbench"].push(new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), err.message, vscode.DiagnosticSeverity.Error));
            }
        } else if (err.message.includes('Field "Query.') || err.message.includes('Field "Mutation.')) {
            let fieldName = err.nodes[0].value;
            let serviceName = '';
            for (var sn in schemas)
                if (schemas[sn].includes(fieldName))
                    serviceName = sn;

            if (!diagnosticsGroups[serviceName])
                diagnosticsGroups[serviceName] = new Array<vscode.Diagnostic>();

            diagnosticsGroups[serviceName].push(new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), err.message, vscode.DiagnosticSeverity.Error));
        } else if (err.message.includes('There can be only one type named')) {
            let definitionNode = err.nodes.find(n => n.kind == "ObjectTypeDefinition");
            let serviceName = definitionNode.serviceName;
            let typeToIgnore = definitionNode.name.value;


            let typeDefs = gql(schemas[serviceName]);
            let builtSchema = buildFederatedSchema({ typeDefs });
            const typeInfo = new TypeInfo(builtSchema);

            var editedAST = visit(typeDefs,
                visitWithTypeInfo(typeInfo, {
                    Field(node) {
                        const parentType = typeInfo.getParentType();
                        console.log(parentType);



                        return { ...node }
                    }
                }));

            if (!diagnosticsGroups[serviceName])
                diagnosticsGroups[serviceName] = new Array<vscode.Diagnostic>();

            diagnosticsGroups[serviceName].push(new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), err.message, vscode.DiagnosticSeverity.Error));
        } else {
            if (!diagnosticsGroups["workbench"])
                diagnosticsGroups["workbench"] = new Array<vscode.Diagnostic>();
            diagnosticsGroups["workbench"].push(new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), err.message, vscode.DiagnosticSeverity.Error));
        }
    })

    return diagnosticsGroups;
}


// let type = err.message.split('`')[1];
//                 // let typeDefs = gql(schemas[serviceName]);
//                 // let builtSchema = buildFederatedSchema({ typeDefs });
//                 // const typeInfo = new TypeInfo(builtSchema);
//                 if (!diagnosticsGroups[serviceName])
//                     diagnosticsGroups[serviceName] = new Array<vscode.Diagnostic>();

//                 diagnosticsGroups[serviceName].push(new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), err.message, vscode.DiagnosticSeverity.Error));
//                 // let visitor = visit(typeDefs, {
//                 //     enter(node, key, parent, path, ancestors) {
//                 //         if ((node as any)?.value === type) {
//                 //             let start = node.loc?.start.toString();
//                 //             let end = node.loc?.end.toString();
//                 //             let range = node.loc?.startToken.start.toString();
//                 //         }
//                 //     }
//                 //     // visitWithTypeInfo(typeInfo, {
//                 //     //     Field(node) {
//                 //     //         console.log(node);
//                 //     //     },

//                 // });
//                 ;
//                 // let nodeValue = builtSchema.parseValue(schemas[serviceName]);

//                 // visit(gql(printSchema(builtSchema)),
//                 //     visitWithTypeInfo(typeInfo, {
//                 //         enter(node, a, b, c, d) {
//                 //             if ((node as any)?.value === type) {
//                 //                 // let start = loc?.start.toString();
//                 //                 // let end = loc?.end.toString();
//                 //                 // let range = loc?.startToken.start.toString();
//                 //             }
//                 //         }
//                 //     }));