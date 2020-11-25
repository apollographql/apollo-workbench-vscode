import { workspace } from "vscode";

import { runOnlineParser } from './runOnlineParser';
import { FieldWithType } from "../workbench/federationCompletionProvider";
import { WorkbenchFileManager } from "../workbench/workbenchFileManager";

export async function extractDefinedEntitiesByService() {
    let extendables: { [serviceName: string]: { type: string, keyFields: FieldWithType[] }[] } = {};
    try {
        let directivesState: { fields: Partial<FieldWithType>[], type?: string, serviceName?: string } = { fields: [] };
        let textDoc = await workspace.openTextDocument(WorkbenchFileManager.composedSchemaPath);

        runOnlineParser(textDoc.getText(), (state, range, tokens) => {
            switch (state.kind) {
                case "StringValue" as any:
                    let argument = state?.prevState?.prevState;
                    let directive = argument?.prevState?.prevState;
                    let objectType = directive?.prevState;

                    if (objectType?.kind == 'ObjectTypeDef' && directive?.kind == "Directive" && argument?.kind == "Argument") {
                        let directiveName = directive.name;
                        if (directiveName == 'owner' && argument.name == 'graph') {
                            let serviceName = textDoc.getText(range);
                            directivesState.serviceName = serviceName.replace(/"/g, '');
                        }
                        if (directiveName == 'key' && argument.name == 'fields') {
                            let fieldValues = textDoc.getText(range);
                            //TODO Regex-ify
                            let fields = fieldValues.replace(/["{}]/g, '').trim().split(' ');
                            //TDOD support composite keys
                            fields.forEach(field => {
                                if (!directivesState.fields.find(f => f.field == field))
                                    directivesState.fields.push({ field })
                            });
                        }
                    }
                    break;
                case "Type" as any:
                    let fieldDef = state?.prevState?.name;
                    let fieldType = textDoc.getText(range);
                    let fieldTypeThing = directivesState.fields.find(f => f.field === fieldDef && !f.type);
                    if (fieldDef && fieldTypeThing)
                        fieldTypeThing.type = fieldType;

                    break;
                case "NonNullType":
                    let type = state?.prevState;
                    let field = state?.prevState?.prevState;
                    let object = state?.prevState?.prevState?.prevState;
                    if (object?.kind == 'ObjectTypeDef' && field?.kind == 'FieldDef' && type?.kind == 'Type' as any) {
                        let fieldDef = field.name;
                        let fieldTypeThing = directivesState.fields.find(f => f.field === fieldDef);
                        if (fieldDef && fieldTypeThing)
                            fieldTypeThing.type = `${type?.type}!`;
                    }
                    break;

                case "ObjectTypeDef":
                    let typeName = state.name;
                    let serviceName = directivesState.serviceName;
                    let fields = directivesState.fields.flatMap((x) => {
                        if (x.type && x.field) return { field: x.field, type: x.type };
                        return [];
                    });
                    if (typeName && serviceName && fields.length > 0) {
                        if (!extendables[serviceName])
                            extendables[serviceName] = [];

                        extendables[serviceName].push({ type: typeName, keyFields: fields });
                    }
                    directivesState = { fields: [] }
                    break;
                default: ''
            }
        });
    } catch (err) {
        console.log(err);
    }

    return extendables;
}



