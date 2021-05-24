import {
  BREAK,
  EnumTypeDefinitionNode,
  InterfaceTypeDefinitionNode,
  ObjectTypeDefinitionNode,
  parse,
  ScalarTypeDefinitionNode,
  visit,
} from 'graphql';
import { FileProvider } from '../../workbench/file-system/fileProvider';

import { runOnlineParser } from './runOnlineParser';

export function getServiceAvailableTypes(
  serviceName: string,
  wbFilePath: string,
): string[] {
  const types: string[] = [];
  const interfaces: string[] = [];
  const objectTypes: string[] = [];
  const enums: string[] = [];
  const scalars: string[] = [];

  try {
    const localSchema = FileProvider.instance.workbenchFileFromPath(wbFilePath)
      ?.schemas[serviceName];
    if (localSchema) {
      const doc = parse(localSchema.sdl);

      visit(doc, {
        ObjectTypeDefinition(objectTypeNode: ObjectTypeDefinitionNode) {
          const typeNode = `O:${objectTypeNode.name.value}`;
          if (!interfaces.includes(typeNode)) {
            interfaces.push(typeNode);
            interfaces.push(`[${typeNode}]`);
          }
        },
        InterfaceTypeDefinition(interfaceNode: InterfaceTypeDefinitionNode) {
          const typeNode = `I:${interfaceNode.name.value}`;
          if (!objectTypes.includes(typeNode)) {
            objectTypes.push(typeNode);
            objectTypes.push(`[${typeNode}]`);
          }
        },
        EnumTypeDefinition(enumNode: EnumTypeDefinitionNode) {
          const typeNode = `E:${enumNode.name.value}`;
          if (!enums.includes(typeNode)) {
            enums.push(typeNode);
            enums.push(`[${typeNode}]`);
          }
        },
        ScalarTypeDefinition(scalarNode: ScalarTypeDefinitionNode) {
          const typeNode = `S:${scalarNode.name.value}`;
          if (!scalars.includes(typeNode)) {
            scalars.push(typeNode);
            scalars.push(`[${typeNode}]`);
          }
        },
      });
    }
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

export function extractEntityNames(schema: string): string[] {
  const entityName: string[] = [];
  try {
    runOnlineParser(schema, (state, range, tokens) => {
      switch (state.kind) {
        case 'StringValue' as any: {
          const argument = state?.prevState?.prevState;
          const directive = argument?.prevState?.prevState;
          const objectType = directive?.prevState;
          const definitionType = objectType?.prevState;

          if (
            objectType?.name &&
            definitionType?.kind == ('Definition' as any) &&
            objectType?.kind == 'ObjectTypeDef' &&
            directive?.kind == 'Directive' &&
            argument?.kind == 'Argument' &&
            argument.name == 'fields' &&
            directive.name == 'key'
          ) {
            if (!entityName.includes(objectType.name))
              entityName.push(objectType.name);
          }
          break;
        }
      }
    });
  } catch (err) {
    console.log(err);
  }

  return entityName;
}
