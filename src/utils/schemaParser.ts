import { BREAK, EnumTypeDefinitionNode, InterfaceTypeDefinitionNode, ObjectTypeDefinitionNode, parse, ScalarTypeDefinitionNode, visit } from "graphql";

import { WorkbenchFileManager } from "../workbench/workbenchFileManager";
import { runOnlineParser } from "./runOnlineParser";

export function getServiceAvailableTypes(serviceName: string): string[] {
    let types: string[] = [];
    let interfaces: string[] = [];
    let objectTypes: string[] = [];
    let enums: string[] = [];
    let scalars: string[] = [];

    try {
        let localSchema = WorkbenchFileManager.getLocalSchemaFromFile(serviceName);
        let doc = parse(localSchema);

        visit(doc, {
            ObjectTypeDefinition(objectTypeNode: ObjectTypeDefinitionNode) {
                let typeNode = `O:${objectTypeNode.name.value}`;
                if (!interfaces.includes(typeNode)) {
                    interfaces.push(typeNode);
                    interfaces.push(`${typeNode}[]`);
                }
            },
            InterfaceTypeDefinition(interfaceNode: InterfaceTypeDefinitionNode) {
                let typeNode = `I:${interfaceNode.name.value}`;
                if (!objectTypes.includes(typeNode)) {
                    objectTypes.push(typeNode);
                    objectTypes.push(`${typeNode}[]`);
                }
            },
            EnumTypeDefinition(enumNode: EnumTypeDefinitionNode) {
                let typeNode = `E:${enumNode.name.value}`;
                if (!enums.includes(typeNode)) {
                    enums.push(typeNode);
                    enums.push(`${typeNode}[]`);
                }
            },
            ScalarTypeDefinition(scalarNode: ScalarTypeDefinitionNode) {
                let typeNode = `S:${scalarNode.name.value}`;
                if (!scalars.includes(typeNode)) {
                    scalars.push(typeNode);
                    scalars.push(`${typeNode}[]`);
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
    types.push('String[]');
    types.push('Int[]');
    types.push('Float');
    types.push('Float[]');
    types.push('Boolean');
    types.push('Boolean[]');

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