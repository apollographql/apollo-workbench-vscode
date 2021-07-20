import {
  BREAK,
  EnumTypeDefinitionNode,
  InterfaceTypeDefinitionNode,
  ObjectTypeDefinitionNode,
  parse,
  ScalarTypeDefinitionNode,
  visit,
} from 'graphql';
import { log } from '../../utils/logger';
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
    log(err.message);
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
    log(err);
  }

  return entityName;
}

export function addFederationSpecAsNeeded(schemaString: string): string {
  let schemaModifications: { addEntityScalar?: undefined | boolean, addServiceScalar?: undefined | boolean, addAnyScalar?: undefined | boolean, } = {}

  runOnlineParser(schemaString, (state, ruleRange, tokens) => {
    if (ruleRange.isSingleLine)
      switch (state.kind) {
        case 'ScalarDef': {
          if (state.name == "_Entity")
            schemaModifications.addEntityScalar = false;
          else if (state.name == "_Service")
            schemaModifications.addServiceScalar = false;
          if (state.name == "_Any")
            schemaModifications.addAnyScalar = false;

          break;
        }
        case 'NamedType' as any: {
          let prevState = state.prevState;

          if (state.name == "_Entity" && schemaModifications.addEntityScalar == undefined) {
            while (prevState != undefined) {
              if (prevState.name == '_entities')
                schemaModifications.addEntityScalar = true

              prevState = prevState.prevState;
            }
          } else if (state.name == '_Service' && schemaModifications.addServiceScalar == undefined) {
            while (prevState != undefined) {
              if (prevState.name == '_service')
                schemaModifications.addServiceScalar = true

              prevState = prevState.prevState;
            }
          } else if (state.name == '_Any' && schemaModifications.addAnyScalar == undefined) {
            while (prevState != undefined) {
              if (prevState.name == 'representations')
                schemaModifications.addAnyScalar = true

              prevState = prevState.prevState;
            }
          }

          break;
        }
      }
  });

  if (schemaModifications?.addEntityScalar)
    schemaString = schemaString.concat('scalar _Entity\n');
  if (schemaModifications?.addServiceScalar)
    schemaString = schemaString.concat('scalar _Service\n');
  if (schemaModifications?.addAnyScalar)
    schemaString = schemaString.concat('scalar _Any\n');

  return schemaString;
}