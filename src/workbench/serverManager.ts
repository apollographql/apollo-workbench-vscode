import { CodeAction, Diagnostic, DiagnosticSeverity, ProgressLocation, Range, Uri, window, workspace } from "vscode";
import { BREAK, GraphQLError, parse, TypeInfo, visit, visitWithTypeInfo } from "graphql";

import { ApolloServer, gql } from "apollo-server";
import plugin from 'apollo-server-plugin-operation-registry';
import { buildFederatedSchema, composeAndValidate } from "@apollo/federation";
import { ApolloServerPluginUsageReportingDisabled } from 'apollo-server-core';

import { StateManager } from "./stateManager";
import { OverrideApolloGateway } from "../gateway";
import { ApolloWorkbench, compositionDiagnostics } from "../extension";
import { WorkbenchFileManager } from "./workbenchFileManager";
import { existsSync } from "fs";

const { name } = require('../../package.json');

export class ServerManager {
    private static _instance: ServerManager;
    static get instance(): ServerManager {
        if (!this._instance)
            this._instance = new ServerManager();
        return this._instance;
    }

    //For any service being mocked, we will store a port mapping of serviceName to port
    portMapping: { [serviceName: string]: string } = {};
    //serverState will hold the ApolloServer/ApolloGateway instances based on the ports they are running on
    private serversState: { [port: string]: any } = {};

    startMocks() {
        console.log(`${name}:Setting up mocks`);
        let workbenchFile = WorkbenchFileManager.getSelectedWorkbenchFile();
        if (workbenchFile) {
            console.log(`${name}:Mocking workbench file: ${workbenchFile.graphName}`);
            for (var serviceName in workbenchFile.schemas) {
                if (workbenchFile.schemas[serviceName].shouldMock)
                    this.startServer(serviceName, workbenchFile.schemas[serviceName].sdl);
            }

            this.startGateway();
            // this.getComposedSchemaLogCompositionErrors(workbenchFile);
        } else
            console.log(`${name}:No selected workbench file to setup`);
    }
    stopMocks() {
        if (this.serversState?.gateway)
            this.serversState.gateway.experimental_pollInterval = 10000000;

        for (var port in this.serversState) {
            if (port != 'gateway') {
                console.log(`${name}:Stopping server running at port ${port}...`);
                this.stopServerOnPort(port);
            }
        }
        this.portMapping = {};
    }
    startServer(serviceName: string, schemaString: string) {
        const port = this.portMapping[serviceName] ?? this.getNextAvailablePort();
        console.log(`${name}:Starting ${serviceName} on port ${port}`);
        if (this.serversState[port]) {
            console.log(`${name}:Stopping previous running server at port ${port}`);
            this.serversState[port].stop();
            delete this.serversState[port];
        }

        if (schemaString == '') {
            console.log(`${name}:No schema defined for ${serviceName} service.`)
            return;
        }

        try {
            const typeDefs = gql(schemaString);
            const server = new ApolloServer({
                schema: buildFederatedSchema(typeDefs),
                mocks: true,
                mockEntireSchema: false,
                engine: false,
                subscriptions: false
            });
            server.listen({ port }).then(({ url }) => console.log(`${name}:🚀 ${serviceName} mocked server ready at ${url}`));

            //Set the mappings to the server that is starting up
            this.serversState[port] = server;
            this.portMapping[serviceName] = port;

        } catch (err) {
            if (err.message.includes('EOF')) {
                console.log(`${name}:${serviceName} has no contents, try defining a schema`);
            } else {
                console.log(`${name}:${serviceName} had errors starting up mocked server: ${err}`);
            }
        }
    }
    stopServerByName(serviceName: string) {
        let serverPort = this.portMapping[serviceName];
        if (serverPort) {
            this.serversState[serverPort].stop();
            delete this.serversState[serverPort];
        }
        if (this.portMapping[serviceName])
            delete this.portMapping[serviceName];
    }
    stopServerOnPort(port: string) {
        let serviceName = '';
        for (var sn in this.portMapping)
            if (this.portMapping[sn] == port)
                serviceName = sn;

        this.stopServer(port);

        if (this.portMapping[serviceName])
            delete this.portMapping[serviceName];
    }
    startGateway() {
        let gatewayPort = StateManager.settings_gatewayServerPort;
        if (this.serversState[gatewayPort]) {
            console.log(`${name}:Stopping previous running gateway`);
            this.serversState[gatewayPort].stop();
            delete this.serversState[gatewayPort];
        }
        //We always have a gateway running in the background and change it's pollInterval when not in use
        //This is a workaround because `server.stop()` doesn't stop that polling and becomes a memory leak if releasing the serer
        if (!this.serversState['gateway']) {
            console.log(`${name}:No gateway instance stored, creating instance`)
            this.serversState['gateway'] = new OverrideApolloGateway({ debug: true });
        } else {
            console.log(`${name}:Changing gateway instance polling interval to 10s`);
            this.serversState['gateway'].experimental_pollInterval = StateManager.settings_gatewayReCompositionInterval ?? 10000;
        }

        const graphApiKey = StateManager.settings_apiKey;
        const graphVariant = StateManager.settings_graphVariant;
        let plugins = [ApolloServerPluginUsageReportingDisabled()];
        const shouldRunOpReg = StateManager.settings_shouldRunOpRegistry;
        if (shouldRunOpReg) {
            console.log(`${name}:Enabling operation registry for ${graphVariant}`);
            plugins = [ApolloServerPluginUsageReportingDisabled(), plugin({ graphVariant, forbidUnregisteredOperations: shouldRunOpReg, debug: true })()];
        }

        const server = new ApolloServer({
            gateway: this.serversState['gateway'],
            subscriptions: false,
            apollo: {
                key: graphApiKey,
                graphVariant
            },
            plugins
        });

        server.listen({ port: gatewayPort }).then(({ url }) => {
            console.log(`${name}:🚀 Apollo Workbench gateway ready at ${url}`);
        });

        this.serversState[gatewayPort] = server;
    }
    private stopServer(port: string) {
        this.serversState[port].stop();
        delete this.serversState[port];
    }
    private getNextAvailablePort() {
        let port = StateManager.settings_startingServerPort;
        while (this.serversState[port])
            port++;

        return port;
    }

    getComposedSchema(workbenchFile: ApolloWorkbench) {
        let sdls: any = [];
        let errors: GraphQLError[] = [];
        for (var key in workbenchFile.schemas) {
            let localSchemaString = workbenchFile.schemas[key].sdl;
            if (localSchemaString) {
                try {
                    sdls.push({ name: key, typeDefs: gql(localSchemaString) });
                } catch (err) {
                    let errorMessage = `Not valid GraphQL Schema: ${err.message}`;
                    let extensions: any = { invalidSchema: true, serviceName: key };

                    if (err.message.includes('Syntax Error: Unexpected Name ')) {
                        let quotedUnexpected = err.message.split('Syntax Error: Unexpected Name "')[1];
                        let unexpectedName = quotedUnexpected.slice(0, quotedUnexpected.length - 1);
                        extensions.locations = err.locations;
                        extensions.unexpectedName = unexpectedName;
                    } else if (err.message.includes('Syntax Error: Expected Name, found }')) {
                        errorMessage = `You must define some fields: ${err.message}`;
                        extensions.noFieldsDefined = true;
                        extensions.locations = err.locations;
                    }

                    errors.push(new GraphQLError(errorMessage, undefined, undefined, undefined, undefined, undefined, extensions));
                }
            } else {
                let err = "No schema defined for service";
                errors.push(new GraphQLError(err, undefined, undefined, undefined, undefined, undefined, { noSchemaDefined: true, serviceName: key, message: err }));
            }
        }

        const compositionResults = composeAndValidate(sdls);

        if (Object.keys(workbenchFile.schemas).length == 0)
            compositionResults.errors = [new GraphQLError("No schemas defined in workbench yet", undefined, undefined, undefined, undefined, undefined, { noServicesDefined: true })];

        errors.map(error => compositionResults.errors.push(error));

        return { ...compositionResults };
    }
    async getComposedSchemaLogCompositionErrors(workbenchFile?: ApolloWorkbench): Promise<void> {
        if (!workbenchFile)
            workbenchFile = WorkbenchFileManager.getSelectedWorkbenchFile() as ApolloWorkbench;
        try {
            const { errors, composedSdl } = this.getComposedSchema(workbenchFile);
            if (errors.length > 0) {
                console.log('Composition Errors Found:');

                compositionDiagnostics.clear();

                console.log(compositionDiagnostics.name);
                let diagnosticsGroups = await this.handleErrors(workbenchFile, errors);
                for (var sn in diagnosticsGroups) {
                    if (sn == 'workbench') {
                        compositionDiagnostics
                        compositionDiagnostics.set(Uri.file(StateManager.workspaceState_selectedWorkbenchFile.path), diagnosticsGroups[sn]);
                    } else
                        compositionDiagnostics.set(Uri.file(`${WorkbenchFileManager.workbenchSchemasFolderPath()}/${sn}.graphql`), diagnosticsGroups[sn]);
                }
            } else
                compositionDiagnostics.clear();

            if (composedSdl) {
                workbenchFile.composedSchema = composedSdl;
                WorkbenchFileManager.saveSelectedWorkbenchFile(workbenchFile);
            }
        }
        catch (err) {
            console.log(`${err}`);
        }
    }

    async handleErrors(wb: ApolloWorkbench, errors: GraphQLError[]) {
        let schemas = wb.schemas;
        let diagnosticsGroups: { [key: string]: Diagnostic[]; } = {};

        for (var i = 0; i < errors.length; i++) {
            let error = errors[i];
            if (error.extensions) {
                let diagnosticCode = '';
                let errorMessage = error.message;
                let range = new Range(0, 0, 0, 1);
                let serviceName = error.extensions?.serviceName ?? 'workbench';
                if (!diagnosticsGroups[serviceName]) diagnosticsGroups[serviceName] = new Array<Diagnostic>();

                if (error.extensions?.noServicesDefined) {
                    let emptySchemas = `"schemas":{}`;
                    let doc = await workspace.openTextDocument(Uri.file(StateManager.workspaceState_selectedWorkbenchFile.path));
                    let textLine = doc.lineAt(0);
                    let schemasIndex = textLine.text.indexOf(emptySchemas);

                    range = new Range(0, schemasIndex, 0, schemasIndex + emptySchemas.length);
                } else if (error.extensions?.noSchemaDefined || error.extensions?.invalidSchema) {
                    let schemaFilePath = `${WorkbenchFileManager.workbenchSchemasFolderPath()}/${serviceName}.graphql`;
                    while (!existsSync(schemaFilePath))
                        await new Promise(resolve => setTimeout(resolve, 50))

                    let doc = await workspace.openTextDocument(Uri.file(schemaFilePath));
                    if (error.extensions.unexpectedName) {
                        let unexpectedName = error.extensions.unexpectedName;
                        let location = error.extensions.locations[0];
                        let lineNumber = location.line - 1;
                        let textIndex = location.column - 1;
                        diagnosticCode = 'deleteRange';
                        range = new Range(lineNumber, textIndex, lineNumber, textIndex + unexpectedName.length);
                    } else if (error.extensions.noFieldsDefined) {
                        let location = error.extensions.locations[0];
                        let lineNumber = location.line - 1;

                        range = new Range(lineNumber - 1, 0, lineNumber, 0);
                    } else {
                        let lastLine = doc.lineAt(doc.lineCount - 1);

                        range = new Range(0, 0, doc.lineCount - 1, lastLine.text.length);
                    }
                } else if (error.extensions?.code) {
                    //We have a federation error with code
                    let errSplit = error.message.split('] ');
                    serviceName = errSplit[0].substring(1);
                }
                let diag = new Diagnostic(range, errorMessage, DiagnosticSeverity.Error);
                if (diagnosticCode)
                    diag.code = diagnosticCode;

                diagnosticsGroups[serviceName].push(diag);
            }
        }

        return diagnosticsGroups;
    }

    handleCompositionErrors(wb: ApolloWorkbench, errors) {
        let schemas = wb.schemas;
        let diagnosticsGroups: { [key: string]: Diagnostic[]; } = {};
        errors.map(err => {
            let serviceName = "";
            let typeToIgnore = "";
            if (err.extensions) {
                let errorCode = err.extensions.code;
                let errSplit = err.message.split('] ');
                serviceName = errSplit[0].substring(1);

                switch (errorCode) {
                    case "KEY_FIELDS_MISSING_EXTERNAL":
                    case "KEY_FIELDS_MISSING_ON_BASE":
                        typeToIgnore = errSplit[1].split(' ->')[0];
                        break;

                    case "EXECUTABLE_DIRECTIVES_IN_ALL_SERVICES":
                        serviceName = ""
                        let services = err.message.split(':')[1].split(',');
                        if (services.length > 1)
                            services.map(service => {
                                let sn = service.includes('.') ? service.substring(1, service.length - 1) : service.substring(1, service.length);
                                serviceName += `${sn}-:-`;
                            });
                        else serviceName = services[0];

                        typeToIgnore = serviceName;
                        break;
                }

                if (typeToIgnore) {
                    if (serviceName.includes('-:-')) {
                        let services = serviceName.split('-:-');
                        services.map(s => {
                            if (s) {
                                if (!diagnosticsGroups[s]) diagnosticsGroups[s] = new Array<Diagnostic>();
                                let diagnostic = this.getDiagnostic(typeToIgnore, err.message, schemas[s].sdl);
                                diagnosticsGroups[s].push(diagnostic);
                            }
                        })
                    } else {
                        if (!diagnosticsGroups[serviceName]) diagnosticsGroups[serviceName] = new Array<Diagnostic>();

                        let diagnostic = this.getDiagnostic(typeToIgnore, err.message, schemas[serviceName].sdl);
                        diagnosticsGroups[serviceName].push(diagnostic);
                    }
                }

                if (errorCode) {
                    if (errorCode === 'EXECUTABLE_DIRECTIVES_IN_ALL_SERVICES') {
                        let services = err.message.split(':')[1].split(',');
                        services.map(service => {
                            let sn = service.includes('.') ? service.substring(1, service.length - 1) : service.substring(1, service.length);
                            if (!diagnosticsGroups[sn])
                                diagnosticsGroups[sn] = new Array<Diagnostic>();
                            diagnosticsGroups[sn].push(new Diagnostic(new Range(0, 0, 0, 1), err.message, DiagnosticSeverity.Error));
                        });
                    } else {
                        if (!diagnosticsGroups[serviceName])
                            diagnosticsGroups[serviceName] = new Array<Diagnostic>();
                        diagnosticsGroups[serviceName].push(new Diagnostic(new Range(0, 0, 0, 1), err.message, DiagnosticSeverity.Error));
                    }
                } else {
                    if (!diagnosticsGroups["workbench"]) diagnosticsGroups["workbench"] = new Array<Diagnostic>();
                    diagnosticsGroups["workbench"].push(new Diagnostic(new Range(0, 0, 0, 1), err.message, DiagnosticSeverity.Error));
                }
            }
            else if (err.message.includes('Field "Query.') || err.message.includes('Field "Mutation.')) {
                let fieldName = err.nodes[0].value;
                let serviceName = '';
                for (var sn in schemas)
                    if (schemas[sn].sdl.includes(fieldName))
                        serviceName = sn;

                if (!diagnosticsGroups[serviceName])
                    diagnosticsGroups[serviceName] = new Array<Diagnostic>();

                diagnosticsGroups[serviceName].push(new Diagnostic(new Range(0, 0, 0, 1), err.message, DiagnosticSeverity.Error));
            } else if (err.message.includes('There can be only one type named')) {
                let definitionNode = err.nodes.find(n => n.kind == "ObjectTypeDefinition");
                let serviceName = definitionNode.serviceName;
                let typeToIgnore = definitionNode.name.value;

                let diagnostic = this.getDiagnostic(typeToIgnore, err.message, schemas[serviceName].sdl);

                if (!diagnosticsGroups[serviceName])
                    diagnosticsGroups[serviceName] = new Array<Diagnostic>();

                diagnosticsGroups[serviceName].push(diagnostic);

            } else if (err.message.includes('Field') && err.message.includes('can only be defined once')) {
                let serviceName = "workbench"; //definitionNode.serviceName; This is not populated
                let splitMessage = err.message.split('.');
                let typeToIgnore = splitMessage[0].split('"')[1];
                let fieldToIgnore = splitMessage[1].split('"')[0];
                fieldToIgnore = fieldToIgnore.substring(0, fieldToIgnore.length);

                let diagnostic = new Diagnostic(new Range(0, 0, 0, 0), err.message, DiagnosticSeverity.Error);

                if (!diagnosticsGroups[serviceName])
                    diagnosticsGroups[serviceName] = new Array<Diagnostic>();

                diagnosticsGroups[serviceName].push(diagnostic);
            } else {
                if (!diagnosticsGroups["workbench"])
                    diagnosticsGroups["workbench"] = new Array<Diagnostic>();
                diagnosticsGroups["workbench"].push(new Diagnostic(new Range(0, 0, 0, 1), err.message, DiagnosticSeverity.Error));
            }
        })

        return diagnosticsGroups;
    }
    getDiagnostic(typeToLoc: string, errMessage: string, schema: string) {
        let range = new Range(0, 0, 0, 0);
        if (schema) {
            let typeDefs = parse(schema);
            let builtSchema = buildFederatedSchema({ typeDefs });
            const typeInfo = new TypeInfo(builtSchema);

            try {
                visit(typeDefs,
                    visitWithTypeInfo(typeInfo, {
                        enter(node, key, parent, path, ancestors) {
                            if ((node.kind == 'ObjectTypeDefinition' || node.kind == 'ObjectTypeExtension') && node.name.value === typeToLoc) {
                                let startLine = node.loc?.startToken.line ? node.loc?.startToken.line - 1 : + 0;
                                let endLine = node.loc?.endToken.line ? node.loc?.startToken.line - 1 : + 0;

                                range = new Range(startLine, 0, endLine, 6 + typeToLoc.length);
                                return BREAK;
                            }
                        }
                    }));
            } catch (err) {
                console.log(err);
            }
        }

        return new Diagnostic(range, errMessage, DiagnosticSeverity.Error);
    }
}