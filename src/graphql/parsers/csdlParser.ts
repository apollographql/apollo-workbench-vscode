import { runOnlineParser } from './runOnlineParser';
import { FieldWithType } from "../../workbench/federationCompletionProvider";
import { FileProvider } from "../../workbench/file-system/fileProvider";
import { StateManager } from "../../workbench/stateManager";

export async function extractDefinedEntitiesByService(wbFilePath: string) {
    let extendables: { [serviceName: string]: { type: string, keys: { [key: string]: FieldWithType[] } }[] } = {};
    let directivesState: { serviceName?: string, keys: { [key: string]: FieldWithType[] } } = { keys: {} };

    try {
        const wbFile = FileProvider.instance.workbenchFiles.get(wbFilePath);
        if (wbFile) {
            let lines = wbFile?.composedSchema.split('\n');

            runOnlineParser(wbFile.composedSchema, (state, range, tokens) => {
                switch (state.kind) {
                    case "StringValue" as any:
                        let argument = state?.prevState?.prevState;
                        let directive = argument?.prevState?.prevState;
                        let objectType = directive?.prevState;

                        if (objectType?.kind == 'ObjectTypeDef' && directive?.kind == "Directive" && argument?.kind == "Argument") {
                            let directiveName = directive.name;
                            if (directiveName == 'owner' && argument.name == 'graph') {
                                let serviceName = lines[range.start.line].substring(range.start.character, range.end.character);
                                directivesState.serviceName = serviceName.replace(/"/g, '');
                            }
                            if (directiveName == 'key' && argument.name == 'fields') {
                                let fieldValues = lines[range.start.line].substring(range.start.character, range.end.character);
                                //Remove the quotes and brackets from start/end of string
                                fieldValues = fieldValues.substring(2);
                                fieldValues = fieldValues.substring(0, fieldValues.length - 2);

                                directivesState.keys[fieldValues.trim()] = [];

                                let parsedFields: string[] = [];
                                let startIndex = -1;
                                let notComposite = true;
                                for (var i = 0; i < fieldValues.length; i++) {
                                    let lastParsedField = '';
                                    let char = fieldValues[i];
                                    switch (char) {
                                        case ' ':
                                            if (startIndex != -1 && notComposite) {
                                                lastParsedField = fieldValues.substring(startIndex, i);
                                                parsedFields.push(lastParsedField);
                                            }

                                            startIndex = -1
                                            break;
                                        case '{':
                                            notComposite = false;
                                            break;
                                        case '}':
                                            notComposite = true;
                                            break;
                                        default:
                                            if (startIndex == -1)
                                                startIndex = i;
                                            break;
                                    }
                                }

                                parsedFields.forEach(parsedField => {
                                    directivesState.keys[fieldValues.trim()].push({ field: parsedField });
                                });
                            }
                        }
                        break;
                    case "Type" as any:
                        const fieldDef = state?.prevState?.name ?? '';
                        if (fieldDef != '') {
                            const type = lines[range.start.line].substring(range.start.character, range.end.character);
                            Object.keys(directivesState.keys).forEach(key => {
                                if (key.includes(fieldDef)) {
                                    let field = directivesState.keys[key].find(keyField => keyField?.field == fieldDef);
                                    if (field && !field.type)
                                        field.type = type;
                                }
                            })
                        }
                        break;
                    case "NonNullType":
                        let type = state?.prevState;
                        let field = state?.prevState?.prevState;
                        let object = state?.prevState?.prevState?.prevState;
                        if (object?.kind == 'ObjectTypeDef' && field?.kind == 'FieldDef' && type?.kind == 'Type' as any) {
                            let fieldDef = field.name ?? '';
                            if (fieldDef != '') {
                                const type = lines[range.start.line].substring(range.start.character, range.end.character);
                                Object.keys(directivesState.keys).forEach(key => {
                                    if (key.includes(fieldDef)) {
                                        let field = directivesState.keys[key].find(keyField => keyField?.field == fieldDef);
                                        if (field && !field.type)
                                            field.type = `${type}!`;
                                    }
                                })
                            }
                        }
                        break;
                    case "ObjectTypeDef":
                        let typeName = state.name;
                        let serviceName = directivesState.serviceName ?? '';
                        if (serviceName != '' && typeName) {
                            if (!extendables[serviceName])
                                extendables[serviceName] = [];

                            extendables[serviceName].push({ type: typeName, keys: directivesState.keys });
                        }

                        directivesState = { keys: {} };
                        break;
                    default: ''
                }
            });
        }
    } catch (err) {
        console.log(err);
    }

    StateManager.instance.workspaceState_selectedWorkbenchAvailableEntities = extendables;

    return extendables;
}