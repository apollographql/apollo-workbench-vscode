import { BREAK, EnumTypeDefinitionNode, InterfaceTypeDefinitionNode, ObjectTypeDefinitionNode, parse, ScalarTypeDefinitionNode, visit } from "graphql";
import { FileProvider } from "../../workbench/file-system/fileProvider";

import { runOnlineParser } from "./runOnlineParser";
import { FieldWithType } from "../../workbench/federationCompletionProvider";

export function getServiceAvailableTypes(serviceName: string): string[] {
    let types: string[] = [];
    let interfaces: string[] = [];
    let objectTypes: string[] = [];
    let enums: string[] = [];
    let scalars: string[] = [];

    try {
        let localSchema = FileProvider.instance.currrentWorkbenchSchemas[serviceName];
        let doc = parse(localSchema.sdl);

        visit(doc, {
            ObjectTypeDefinition(objectTypeNode: ObjectTypeDefinitionNode) {
                let typeNode = `O:${objectTypeNode.name.value}`;
                if (!interfaces.includes(typeNode)) {
                    interfaces.push(typeNode);
                    interfaces.push(`[${typeNode}]`);
                }
            },
            InterfaceTypeDefinition(interfaceNode: InterfaceTypeDefinitionNode) {
                let typeNode = `I:${interfaceNode.name.value}`;
                if (!objectTypes.includes(typeNode)) {
                    objectTypes.push(typeNode);
                    objectTypes.push(`[${typeNode}]`);
                }
            },
            EnumTypeDefinition(enumNode: EnumTypeDefinitionNode) {
                let typeNode = `E:${enumNode.name.value}`;
                if (!enums.includes(typeNode)) {
                    enums.push(typeNode);
                    enums.push(`[${typeNode}]`);
                }
            },
            ScalarTypeDefinition(scalarNode: ScalarTypeDefinitionNode) {
                let typeNode = `S:${scalarNode.name.value}`;
                if (!scalars.includes(typeNode)) {
                    scalars.push(typeNode);
                    scalars.push(`[${typeNode}]`);
                }
            }
        });
    } catch (err) {
        console.log(err.message);
    }

    //Add Object/Interface/Enum/Scalars definitions
    types.push(...objectTypes);
    types.push(...interfaces);
    types.push(...enums);
    types.push(...scalars);

    //Add GraphQQL default scalar types:
    types.push('ID');
    types.push('Int');
    types.push('String');
    types.push('[String]');
    types.push('[Int]');
    types.push('Float');
    types.push('[Float]');
    types.push('Boolean');
    types.push('[Boolean]');

    return types;
}

export function getRangeForTypeDef(typeToLoc: string, schema: string) {
    let startLine = 0;
    let startColumn = 0;
    let endLine = 0;
    let endColumn = 0;

    if (schema) {
        runOnlineParser(schema, (state, range, tokens) => {
            switch (state.kind) {
                case "ObjectTypeDef":
                    let objectTypeDef = state;
                    if (objectTypeDef?.kind == 'ObjectTypeDef' && objectTypeDef.name == typeToLoc) {
                        startLine = range.start.line;
                        startColumn = range.start.character;
                        endLine = range.end.line;
                        endColumn = range.end.character;
                        return BREAK;
                    }
                    break;
            }
        })
    }
    return {
        startLine,
        startColumn,
        endLine,
        endColumn
    };
}

export function getRangeForFieldNamedType(typeToLoc: string, schema: string) {
    let startLine = 0;
    let startColumn = 0;
    let endLine = 0;
    let endColumn = 0;

    runOnlineParser(schema, (state, range, tokens) => {
        switch (state.kind) {
            case "NamedType":
                let objectTypeDef = state?.prevState?.prevState?.prevState?.prevState;
                let fieldTypeDef = state?.prevState?.prevState?.prevState;
                let namedTypeDef = state;
                if (objectTypeDef?.kind == 'ObjectTypeDef'
                    && fieldTypeDef?.kind == "FieldDef"
                    && namedTypeDef?.kind == 'NamedType'
                    && namedTypeDef.name == typeToLoc
                ) {
                    startLine = range.start.line;
                    startColumn = range.start.character;
                    endLine = range.end.line;
                    endColumn = range.end.character;
                    return BREAK;
                }
                break;
        }
    })

    return {
        startLine,
        startColumn,
        endLine,
        endColumn
    };
}

export function extractEntityNames(schema: string): string[] {
    let entityName: string[] = [];
    try {
        runOnlineParser(schema, (state, range, tokens) => {
            switch (state.kind) {
                case "StringValue" as any:
                    let argument = state?.prevState?.prevState;
                    let directive = argument?.prevState?.prevState;
                    let objectType = directive?.prevState;
                    let definitionType = objectType?.prevState;

                    if (objectType?.name
                        && definitionType?.kind == "Definition" as any
                        && objectType?.kind == 'ObjectTypeDef'
                        && directive?.kind == "Directive"
                        && argument?.kind == "Argument"
                        && argument.name == 'fields'
                        && directive.name == 'key') {
                        if (!entityName.includes(objectType.name)) entityName.push(objectType.name);
                    }
                    break;
            }
        });
    } catch (err) {
        console.log(err);
    }

    return entityName;
}

export function extractEntitiesWithKeys(schema: string) {
    let lines = schema.split('\n');
    let entitiesState = {};
    let entities = {};
    let directivesState: { [key: string]: FieldWithType[] } = {};

    runOnlineParser(schema, (state, range, tokens) => {
        console.log(state.kind);

        switch (state.kind) {
            case "StringValue":
                let argument = state?.prevState?.prevState;
                let directive = argument?.prevState?.prevState;
                let objectType = directive?.prevState;

                if (objectType?.kind == 'ObjectTypeDef' && directive?.kind == "Directive" && argument?.kind == "Argument") {
                    console.log(state);
                    let directiveName = directive.name;
                    if (directiveName == 'key' && argument.name == 'fields') {
                        let fieldValues = lines[range.start.line].substring(range.start.character, range.end.character);
                        //Remove the quotes and brackets from start/end of string
                        fieldValues = fieldValues.substring(1);
                        fieldValues = fieldValues.substring(0, fieldValues.length - 1);

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
                            directivesState[fieldValues.trim()].push({ field: parsedField });
                        });
                    }
                }
                break;
            case "Type" as any:
                const fieldDef = state?.prevState?.name ?? '';
                if (fieldDef != '') {
                    const type = lines[range.start.line].substring(range.start.character, range.end.character);
                    Object.keys(directivesState).forEach(key => {
                        if (key.includes(fieldDef)) {
                            let field = directivesState[key].find(keyField => keyField?.field == fieldDef);
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
                        Object.keys(directivesState).forEach(key => {
                            if (key.includes(fieldDef)) {
                                let field = directivesState[key].find(keyField => keyField?.field == fieldDef);
                                if (field && !field.type)
                                    field.type = `${type}!`;
                            }
                        })
                    }
                }
                break;
            case "ObjectTypeDef":
                let typeName = state.name;
                if (typeName) {
                    if (!entitiesState[typeName])
                        entitiesState[typeName] = {};

                }
                //Reset directive state for finding defined keys
                directivesState = {};
                break;

        }
    });

    return entities;
}