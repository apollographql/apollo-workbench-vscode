import { isTypeNodeAnEntity } from '@apollo/federation/dist/composition/utils';
import { existsSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync, copyFileSync, readdirSync } from 'fs';
import { BREAK, DocumentNode, InterfaceTypeDefinitionNode, ObjectTypeDefinitionNode, parse, TypeDefinitionNode, visit } from 'graphql';
import { type } from 'os';
import { join } from 'path';
import { window, workspace } from 'vscode';
import { ApolloWorkbench, WorkbenchSchema } from '../extension';
import { getGraphSchemasByVariant } from '../studio-gql/graphClient';
import { GetGraphSchemas_service_implementingServices_FederatedImplementingServices, GetGraphSchemas_service_implementingServices_NonFederatedImplementingService } from '../studio-gql/types/GetGraphSchemas';
import { FieldWithType } from './federationCompletionProvider';
import { StateManager } from './stateManager';

const { name } = require('../../package.json');

export class WorkbenchFileManager {
    private static readonly wbExt = '.apollo-workbench';
    //Workbench folder paths - designed to auto-create necessary watch folders
    static get hiddenWorkspaceFolder(): string {
        //Get the path to the hidden workspace storage location
        //  This seems to be specific to the user instance of VS Code
        const hiddenPath = StateManager.workspaceStoragePath;

        //We make sure there is a folder open in the current vs code window
        if (workspace?.workspaceFolders && hiddenPath) {
            let workspaceUri = workspace?.workspaceFolders[0]?.uri;
            let workspacePath = workspaceUri?.fsPath;

            while (workspacePath.includes('/'))
                workspacePath = workspacePath.replace('/', '-');
            while (workspacePath.includes('\\'))
                workspacePath = workspacePath.replace('\\', '-');
            while (workspacePath.includes(' '))
                workspacePath = workspacePath.replace(' ', '_');

            //We create a hidden workbench folder 
            let workspaceFolder = `${hiddenPath}/${workspacePath}`;

            //Ensure hidden folders are created
            if (!existsSync(hiddenPath))
                mkdirSync(hiddenPath);
            if (!existsSync(workspaceFolder))
                mkdirSync(workspaceFolder);

            return workspaceFolder;
        }

        return "";
    }
    static get hidenWorkbenchFolder(): string {
        const wf = this.hiddenWorkspaceFolder;
        if (wf) {
            let workbenchFolderPath = `${wf}/workbench`;

            if (!existsSync(workbenchFolderPath))
                mkdirSync(workbenchFolderPath);

            return workbenchFolderPath;
        }
        return "";
    }
    static get openWorkspaceFolder(): string {
        if (workspace?.workspaceFolders)
            return workspace?.workspaceFolders[0]?.uri.fsPath ?? '';

        return "";
    }
    static workbenchQueriesFolderPath(autoCreate: boolean = true): string {
        const wBenchFolder = this.hidenWorkbenchFolder;
        if (wBenchFolder) {
            let folderPath = `${wBenchFolder}/queries`;
            if (!existsSync(folderPath) && autoCreate)
                mkdirSync(folderPath);

            const wSpaceFolder = this.openWorkspaceFolder;
            if (wSpaceFolder && !existsSync(`${wSpaceFolder}/apollo.config.js`)) {
                const gatewayPort = StateManager.settings_gatewayServerPort;
                let apolloConfig = `module.exports = { client: { service: { url: "http://localhost:${gatewayPort}" }, includes: ["${wBenchFolder}/queries/*.graphql"] } }`;
                writeFileSync(`${wSpaceFolder}/apollo.config.js`, apolloConfig, { encoding: "utf8" });
            }

            return folderPath;
        }

        return "";
    }
    static workbenchSchemasFolderPath(autoCreate: Boolean = true) {
        let wBenchFolder = this.hidenWorkbenchFolder;
        if (wBenchFolder) {
            let folderPath = `${wBenchFolder}/schemas`;
            if (!existsSync(folderPath) && autoCreate)
                mkdirSync(folderPath);

            return folderPath;
        }
        return "";
    }
    //Methods for Workbench files

    //Methods for schema files
    static getLocalSchemaFromFile(serviceName) {
        return readFileSync(`${this.workbenchSchemasFolderPath()}/${serviceName}.graphql`, { encoding: "utf8" });
    }
    static writeLocalSchemaToFile(serviceName: string, sdl: string) {
        writeFileSync(`${this.workbenchSchemasFolderPath()}/${serviceName}.graphql`, sdl, { encoding: "utf8" });
    }
    static getWorkbenchFile(filePath: string): ApolloWorkbench {
        return JSON.parse(readFileSync(filePath, { encoding: "utf8" }));
    }
    static saveWorkbenchFile(wb: ApolloWorkbench, path?: string) {
        if (!path && this.openWorkspaceFolder) path = `${this.openWorkspaceFolder}/${wb.graphName}${this.wbExt}`;
        if (path)
            writeFileSync(path, JSON.stringify(wb), { encoding: "utf8" });
        else
            window.showErrorMessage(`Path was undefined when trying to create workbench file: ${wb.graphName}${this.wbExt}`)
    }
    static saveSelectedWorkbenchFile(wb: ApolloWorkbench) {
        let selectedWbFile = StateManager.workspaceState_selectedWorkbenchFile;
        if (selectedWbFile)
            this.saveWorkbenchFile(wb, selectedWbFile.path);
    }
    static getSelectedWorkbenchFile() {
        let selectedWbFile = StateManager.workspaceState_selectedWorkbenchFile;
        if (selectedWbFile)
            return this.getWorkbenchFile(selectedWbFile.path);
    }
    static async newWorkbenchFileFromGraph(graphName: string, graphId: string, graphVariant: string) {
        if (graphVariant == '') {
            window.showInformationMessage("You must select a variant to load the graph from");
        } else {
            let workbenchFile: ApolloWorkbench = new ApolloWorkbench();
            workbenchFile.graphName = graphName;

            let results = await getGraphSchemasByVariant(StateManager.globalState_userApiKey, graphId, graphVariant);
            let monolithicService = results.service?.implementingServices as GetGraphSchemas_service_implementingServices_NonFederatedImplementingService;
            if (monolithicService?.graphID) {
                workbenchFile.schemas['monolith'] = results.service?.schema?.document;
            } else {
                let implementingServices = results.service?.implementingServices as GetGraphSchemas_service_implementingServices_FederatedImplementingServices;
                implementingServices?.services?.map(service => {
                    let serviceName = service.name;
                    let schema = service.activePartialSchema.sdl;
                    workbenchFile.schemas[serviceName] = new WorkbenchSchema(schema);
                });
            }

            this.saveWorkbenchFile(workbenchFile);
            StateManager.localWorkbenchFilesProvider.refresh();
        }
    }
    static newWorkbenchFile(workbenchName: string) {
        let workbenchMaster: ApolloWorkbench = {
            operations: {},
            queryPlans: {},
            schemas: {},
            composedSchema: '',
            graphName: workbenchName
        }

        console.log(`Creating ${workbenchName}`);
        this.saveWorkbenchFile(workbenchMaster);
        StateManager.localWorkbenchFilesProvider.refresh();
    }

    static async duplicateWorkbenchFile(workbenchFileName: string, filePath: string) {
        let newWorkbenchFileName = await window.showInputBox({ prompt: "Enter the name for new workbench file", value: `${workbenchFileName}-copy` });
        if (newWorkbenchFileName) {
            copyFileSync(filePath, `${this.openWorkspaceFolder}/${newWorkbenchFileName}${this.wbExt}`);
            StateManager.localWorkbenchFilesProvider?.refresh();
        } else {
            window.showInformationMessage("No name entered, cancelling copy");
        }
    }

    static async getCurrentSchemaAvailableTypes(serviceName: string): Promise<string[]> {
        let types: string[] = [];
        let interfaces: string[] = [];
        let objectTypes: string[] = [];

        try {
            let localSchema = this.getLocalSchemaFromFile(serviceName);
            let doc = parse(localSchema);
            visit(doc, {
                ObjectTypeDefinition(objectTypeNode: ObjectTypeDefinitionNode) {
                    let typeNote = `O:${objectTypeNode.name.value}`;
                    if (!interfaces.includes(typeNote)) {
                        interfaces.push(typeNote);
                        interfaces.push(`${typeNote}[]`);
                    }
                },
                InterfaceTypeDefinition(interfaceNode: InterfaceTypeDefinitionNode) {
                    let typeNote = `I:${interfaceNode.name.value}`;
                    if (!objectTypes.includes(typeNote)) {
                        objectTypes.push(typeNote);
                        objectTypes.push(`${typeNote}[]`);
                    }
                }
            });
        } catch (err) {
            console.log(err.message);
        }

        types.push(...objectTypes);
        types.push(...interfaces);
        //Add GraphQQL default scalar types:
        types.push('ID');
        types.push('Int');
        types.push('String');
        types.push('String[]');
        types.push('Int[]');
        types.push('Float');
        types.push('Float[]');
        types.push('Boolean');
        types.push('Boolean[]');


        return types;
    }
    static async getWorkbenchExtendableTypes() {
        let workbenchFile = this.getSelectedWorkbenchFile();
        if (workbenchFile && workbenchFile.composedSchema) {
            let doc = parse(workbenchFile.composedSchema);
            return this.extractEntityNames(doc);
        }
    }

    static isTypeNodeAnEntity(node: TypeDefinitionNode) {
        let keyFields: string[] = [];

        visit(node, {
            Directive(directive) {
                if (directive.name.value === 'key') {
                    if (directive.arguments && (directive.arguments[0].value as any)?.value) {
                        let keys = (directive.arguments[0].value as any).value as string;
                        if (!keyFields.includes(keys))
                            keyFields.push(keys)
                    }
                    // return BREAK;
                }
            },
        });

        return keyFields;
    }


    static getkeyFields(node: ObjectTypeDefinitionNode, keyFields: string) {
        let fields: FieldWithType[] = [];
        let fieldSplit = keyFields.replace('{', '').replace('}', '').split(' ');
        fieldSplit.map(fieldName => {
            if (fieldName) {
                visit(node, {
                    FieldDefinition(field) {
                        if (field.name.value === fieldName) {
                            console.log(field);
                            let fieldType = field.type as any;
                            let isNonNull = fieldType.kind == 'NonNullType';
                            let typeString = fieldType?.name?.value ?? fieldType.type.name.value as string;
                            if (isNonNull) typeString += '!';
                            fields.push({ field: fieldName, type: typeString });

                            return BREAK;
                        }
                    }
                });
            }
        });

        return fields;
    }

    static extractEntityNames(doc: DocumentNode) {
        let extendables: { [serviceName: string]: { type: string, keyFields: FieldWithType[] }[] } = {};

        visit(doc, {
            ObjectTypeDefinition(node) {
                let keyFieldsList = WorkbenchFileManager.isTypeNodeAnEntity(node);
                if (keyFieldsList.length > 0) {
                    let keyDirective = node.directives?.find(x => x.name.value == 'key');
                    let serviceArg = keyDirective?.arguments?.find(x => x.name.value == 'graph')?.value as any;
                    // let fieldsArgs = keyDirective?.arguments?.find(x => x.name.value == 'fields')?.value as any;

                    let serviceName = serviceArg.value;
                    if (!extendables[serviceName]) extendables[serviceName] = [];

                    keyFieldsList.map(keys => {
                        let keyFields = WorkbenchFileManager.getkeyFields(node, keys);
                        extendables[serviceName].push({ type: node.name.value, keyFields });
                    })
                }
            },
        });

        return extendables;
    }

    static async deleteWorkbenchFile(filePath: string) {
        let result = await window.showWarningMessage(`Are you sure you want to delete ${filePath}?`, { modal: true }, "Yes")
        if (result?.toLowerCase() != "yes") return;

        console.log(`${name}:Deleting WB: ${filePath}`);
        let selectedWbFile = StateManager.workspaceState_selectedWorkbenchFile;
        if (selectedWbFile && selectedWbFile.path == filePath) {
            StateManager.context?.workspaceState.update("selectedWbFile", "");

            StateManager.currentWorkbenchSchemasProvider?.refresh();
            StateManager.currentWorkbenchOperationsProvider?.refresh();
        }

        unlinkSync(filePath);
        StateManager.localWorkbenchFilesProvider?.refresh();
    }
    static async deleteWorkbenchFolder() {
        rmdirSync(this.hidenWorkbenchFolder, { recursive: true });
    }
    static getPreloadedWorkbenchFiles() {
        let items: { fileName: string, path: string }[] = [];
        let preloadFileDir = join(__dirname, '..', '..', `/extension/preloaded-files`);
        if (existsSync(preloadFileDir)) {
            let preloadedDirectory = readdirSync(preloadFileDir, { encoding: 'utf-8' });
            preloadedDirectory.map(item => {
                items.push({ fileName: item.split('.')[0], path: `${preloadFileDir}/${item}` });
            });
        }
        return items;
    }
    static async copyPreloadedWorkbenchFile(fileName: string) {
        let file = `${fileName}.apollo-workbench`;
        let preloadFileDir = join(__dirname, '..', '..', `/extension/preloaded-files/${file}`);
        await this.duplicateWorkbenchFile(fileName, preloadFileDir);
        StateManager.updateSelectedWorkbenchFile(fileName, `${this.openWorkspaceFolder}/${fileName}${this.wbExt}`)
    }
}

