import {
  GraphQLError,
  GraphQLSchema,
  parse,
  extendSchema,
  visit,
  StringValueNode,
  EnumValueNode,
  ArgumentNode,
  getIntrospectionQuery,
  buildClientSchema,
  printSchema,
  print,
  FieldDefinitionNode,
  DocumentNode,
} from 'graphql';
import {
  ApolloWorkbenchFile,
  WorkbenchOperation,
} from './file-system/fileTypes';
import { FieldWithType } from './federationCompletionProvider';
import { log } from '../utils/logger';
import { Headers } from 'node-fetch';

//Federation 2
import {
  compose,
  CompositionFailure,
  CompositionResult,
  CompositionSuccess,
} from '@apollo/composition';
import {
  buildSchema,
  buildSchemaFromAST,
  parseOperation,
  FederationBlueprint,
  Subgraph,
  Subgraphs,
} from '@apollo/federation-internals';
import { QueryPlanner, serializeQueryPlan } from '@apollo/query-planner';
import { gql } from 'graphql-tag';
import { execSync } from 'child_process';

export class WorkbenchFederationProvider {
  static getSchemaFromResults(compResults: CompositionResult) {
    return compResults.schema?.toGraphQLJSSchema();
  }
  static compose(
    workbenchFile: ApolloWorkbenchFile,
  ): CompositionResult | CompositionFailure {
    return WorkbenchFederationProvider.compose_fed_2(workbenchFile);
  }

  private static compose_fed_2(workbenchFile: ApolloWorkbenchFile) {
    const errors: GraphQLError[] = [];
    for (const key in workbenchFile.schemas) {
      const localSchemaString = workbenchFile.schemas[key].sdl;
      if (!localSchemaString) {
        const err = 'No schema defined for service';
        errors.push(
          new GraphQLError(
            err,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            { noSchemaDefined: true, serviceName: key, message: err },
          ),
        );
      }
    }
    if (errors.length > 0) {
      return { errors } as CompositionFailure;
    } else {
      try {
        const subgraphs: Subgraphs = new Subgraphs();

        for (const key in workbenchFile.schemas) {
          const url = workbenchFile.schemas[key].url ?? 'http://localhost';
          const localSchemaString = workbenchFile.schemas[key].sdl;
          if (localSchemaString) {
            try {
              const builtSchema = buildSchema(localSchemaString, {
                blueprint: new FederationBlueprint(false),
                validate: false,
              });
              const subgraph = new Subgraph(key, url, builtSchema);
              subgraphs.add(subgraph);
            } catch (err: any) {
              log(err.message);

              if (err.causes) {
                err.causes.forEach((cause) => errors.push(cause));
              } else {
                err.extensions['subgraph'] = key;
                errors.push(err);
              }
            }
          }
        }

        if (errors.length > 0) {
          return { errors };
        }

        const compositionResults = compose(subgraphs);

        if (Object.keys(workbenchFile.schemas).length == 0) {
          compositionResults.errors = [
            new GraphQLError(
              'No schemas defined in workbench yet',
              undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              { noServicesDefined: true },
            ),
          ];
        }

        return { ...compositionResults } as CompositionResult;
      } catch (err: any) {
        log(err);
        if (err.causes) return { errors: err.causes as GraphQLError[] };
        return {
          errors: [
            new GraphQLError('Unexpected composition error in Workbench'),
          ],
        };
      }
    }
  }

  static normalizeSchema(schema: string) {
    const doc = parse(schema);

    const modifiedDOc = visit(doc, {
      Document(node) {
        const isFedSpec = (i: FieldDefinitionNode) =>
          i.name.value == '__entities' || i.name.value == '__service';
        const definitions = Array.from(node.definitions);
        const queryDefinitionIndex = definitions.findIndex(
          (d) => (d as any).name.value == 'Query',
        );
        if (queryDefinitionIndex >= 0) {
          const queryDefinition = definitions[queryDefinitionIndex];

          if (
            queryDefinition.kind == 'ObjectTypeDefinition' ||
            queryDefinition.kind == 'ObjectTypeExtension'
          ) {
            const queryDefinitions: FieldDefinitionNode[] = [];
            queryDefinition.fields?.forEach((f) => {
              if (!isFedSpec(f)) queryDefinitions.push(f);
            });

            if (queryDefinitions.length > 0) {
              definitions[queryDefinitionIndex] = queryDefinition;
            } else definitions.splice(queryDefinitionIndex, 1);

            return { ...node, definitions };
          }
        }
      },
      ObjectTypeDefinition(node) {
        const objectName = node.name.value;
        if (objectName == '__Entity') {
          return null;
        }
      },
      FieldDefinition(node) {
        if (node.name.value == '_entities' || node.name.value == '_service') {
          return null;
        }
      },
    });

    return print(modifiedDOc);
  }
  static superSchemaToApiSchema(supergraphSDL: string) {
    const schema = new GraphQLSchema({
      query: undefined,
    });
    const parsed = parse(supergraphSDL);
    const finalSchema = extendSchema(schema, parsed, { assumeValidSDL: true });

    return finalSchema;
  }
  static generateQueryPlan(
    opToGenerateQueryPlan: string,
    workbenchFile: ApolloWorkbenchFile,
  ) {
    const operation =
      workbenchFile.operations[opToGenerateQueryPlan] instanceof String
        ? (workbenchFile.operations[opToGenerateQueryPlan] as string) ?? ''
        : (
            workbenchFile.operations[
              opToGenerateQueryPlan
            ] as WorkbenchOperation
          ).operation ?? '';

    return WorkbenchFederationProvider.createQueryPlan(
      operation,
      workbenchFile,
    );
  }
  static async getRemoteTypeDefs(
    serviceName: string,
    workbenchFile: ApolloWorkbenchFile,
  ) {
    const serviceURLOverride = workbenchFile.schemas[serviceName]?.url;
    if (!serviceURLOverride) {
      log(`There was no url found to get remote schema from`);
      return '';
    }

    return execSync(
      `rover subgraph introspect ${serviceURLOverride}`,
    ).toString();
  }
  private static createQueryPlan(
    operation: string,
    workbenchFile: ApolloWorkbenchFile,
  ) {
    const supergraphSdl = workbenchFile.supergraphSdl;
    try {
      const schema = buildSchema(supergraphSdl);
      const documentNode = parse(operation);
      const operationDefinition = documentNode.definitions.find(
        (def) => def.kind === 'OperationDefinition',
      ) as any;
      const operationName = operationDefinition?.name?.value ?? '';
      const op = parseOperation(schema, operation, operationName);
      const queryPlanner = new QueryPlanner(schema);
      const queryPlan = queryPlanner.buildQueryPlan(op);
      const queryPlanString = serializeQueryPlan(queryPlan as any);

      return queryPlanString;
    } catch (err: any) {
      log(err);
      return err?.message ?? '';
    }
  }
  static extractDefinedEntities(schema: string) {
    const entities: {
      [entity: string]: FieldWithType[];
    } = {};

    try {
      visit(parse(schema), {
        ObjectTypeDefinition(node) {
          const keyDirective = node.directives?.find(
            (d) => d.name.value == 'key',
          );
          if (keyDirective) {
            const keyBlock = (
              keyDirective.arguments?.find((a) => a.name.value == 'fields')
                ?.value as StringValueNode
            )?.value;
            const parsedFields: string[] = [];
            let startIndex = -1;
            let notComposite = true;
            for (let i = 0; i < keyBlock.length; i++) {
              let lastParsedField = '';
              const char = keyBlock[i];
              switch (char) {
                case ' ':
                  if (startIndex != -1 && notComposite) {
                    lastParsedField = keyBlock.substring(startIndex, i);
                    parsedFields.push(lastParsedField);
                  }

                  startIndex = -1;
                  break;
                case '{':
                  notComposite = false;
                  break;
                case '}':
                  notComposite = true;
                  break;
                default:
                  if (startIndex == 0 && i == keyBlock.length - 1)
                    parsedFields.push(keyBlock);
                  else if (i == keyBlock.length - 1)
                    parsedFields.push(keyBlock.substring(startIndex));
                  else if (startIndex == -1) startIndex = i;
                  break;
              }
            }
            entities[node.name.value] = [];

            parsedFields.forEach((parsedField) => {
              const finalKey = keyBlock.trim();
              const field = node.fields?.find(
                (f) => f.name.value == parsedField,
              );
              let fieldType = '';
              if (field)
                fieldType =
                  WorkbenchFederationProvider.getFieldTypeString(field);

              entities[node.name.value].push({
                field: parsedField,
                type: fieldType,
              });
            });
          }
        },
      });
    } catch (err: any) {
      log(err.message);
    }

    return entities;
  }
  static extractDefinedEntitiesByService(wbFile: ApolloWorkbenchFile) {
    if (wbFile.federation == '2') {
      return this.extractDefinedEntitiesByService_2(wbFile.supergraphSdl);
    } else {
      return this.extractDefinedEntitiesByService_1(wbFile.supergraphSdl);
    }
  }

  private static extractDefinedEntitiesByService_1(supergraphSdl: string) {
    const extendables: {
      [serviceName: string]: {
        type: string;
        keys: { [key: string]: FieldWithType[] };
      }[];
    } = {};
    const joinGraphEnumValues: { [joinGraphEnum: string]: string } = {};

    try {
      visit(parse(supergraphSdl), {
        ObjectTypeDefinition(node) {
          const joinOwnerDirective = node.directives?.find(
            (d) => d.name.value == 'join__owner',
          );
          if (joinOwnerDirective && joinOwnerDirective.arguments) {
            const joinGraphEnumValue = (
              (joinOwnerDirective.arguments[0] as ArgumentNode)
                .value as EnumValueNode
            ).value;
            const entity: {
              type: string;
              keys: { [key: string]: FieldWithType[] };
            } = { type: node.name.value, keys: {} };

            const joinKeyDirectives = node.directives?.filter(
              (d) =>
                d.name.value == 'join__type' &&
                (
                  d.arguments?.find(
                    (a) =>
                      a.name.value == 'graph' &&
                      (a.value as StringValueNode)?.value == joinGraphEnumValue,
                  )?.value as EnumValueNode
                )?.value,
            );
            if (joinKeyDirectives) {
              joinKeyDirectives?.forEach((jkd) => {
                const keyBlock = (
                  jkd.arguments?.find((a) => a.name.value == 'key')
                    ?.value as StringValueNode
                ).value;
                const parsedFields: string[] = [];
                let startIndex = -1;
                let notComposite = true;
                for (let i = 0; i < keyBlock.length; i++) {
                  let lastParsedField = '';
                  const char = keyBlock[i];
                  switch (char) {
                    case ' ':
                      if (startIndex != -1 && notComposite) {
                        lastParsedField = keyBlock.substring(startIndex, i);
                        parsedFields.push(lastParsedField);
                      }

                      startIndex = -1;
                      break;
                    case '{':
                      notComposite = false;
                      break;
                    case '}':
                      notComposite = true;
                      break;
                    default:
                      if (startIndex == 0 && i == keyBlock.length - 1)
                        parsedFields.push(keyBlock);
                      else if (i == keyBlock.length - 1)
                        parsedFields.push(keyBlock.substring(startIndex));
                      else if (startIndex == -1) startIndex = i;
                      break;
                  }
                }

                parsedFields.forEach((parsedField) => {
                  const finalKey = keyBlock.trim();
                  const field = node.fields?.find(
                    (f) => f.name.value == parsedField,
                  );
                  let fieldType = '';
                  if (field)
                    fieldType =
                      WorkbenchFederationProvider.getFieldTypeString(field);

                  if (entity.keys[finalKey])
                    entity.keys[finalKey].push({
                      field: parsedField,
                      type: fieldType,
                    });
                  else
                    entity.keys[finalKey] = [
                      { field: parsedField, type: fieldType },
                    ];
                });
              });
            }

            if (!extendables[joinGraphEnumValue]) {
              extendables[joinGraphEnumValue] = [entity];
            } else {
              extendables[joinGraphEnumValue].push(entity);
            }
          }
        },
        EnumTypeDefinition(node) {
          if (node.name.value == 'join__Graph') {
            node.values?.forEach((enumValueDefinition) => {
              joinGraphEnumValues[enumValueDefinition.name.value] = (
                enumValueDefinition.directives
                  ?.find((d) => d.name.value == 'join__graph')
                  ?.arguments?.find((a) => a.name.value == 'name')
                  ?.value as StringValueNode
              )?.value;
            });
          }
        },
      });
      Object.keys(extendables).forEach((k) => {
        extendables[joinGraphEnumValues[k]] = extendables[k];
        delete extendables[k];
      });
    } catch (err: any) {
      log(err);
    }

    return extendables;
  }
  private static extractDefinedEntitiesByService_2(supergraphSdl: string) {
    const extendables: {
      [serviceName: string]: {
        type: string;
        keys: { [key: string]: FieldWithType[] };
      }[];
    } = {};
    const joinGraphEnumValues: { [joinGraphEnum: string]: string } = {};

    try {
      visit(parse(supergraphSdl), {
        ObjectTypeDefinition(node) {
          //There can be many types now
          node.directives?.forEach((d) => {
            //Remove from many types what is owned by subgraph open
            if (d && d.name.value == 'join__type' && d.arguments) {
              const joinGraphEnumValue = (
                (d.arguments[0] as ArgumentNode).value as EnumValueNode
              ).value;
              const entity: {
                type: string;
                keys: { [key: string]: FieldWithType[] };
              } = { type: node.name.value, keys: {} };

              const keyArg = d.arguments?.find((a) => a.name.value == 'key');
              const extensionArg = d.arguments?.find(
                (a) => a.name.value == 'extension',
              );

              if (keyArg && !extensionArg) {
                const keyBlock = (keyArg?.value as StringValueNode).value;
                const parsedFields: string[] = [];
                let startIndex = -1;
                let notComposite = true;
                for (let i = 0; i < keyBlock.length; i++) {
                  let lastParsedField = '';
                  const char = keyBlock[i];
                  switch (char) {
                    case ' ':
                      if (startIndex != -1 && notComposite) {
                        lastParsedField = keyBlock.substring(startIndex, i);
                        parsedFields.push(lastParsedField);
                      }

                      startIndex = -1;
                      break;
                    case '{':
                      notComposite = false;
                      break;
                    case '}':
                      notComposite = true;
                      break;
                    default:
                      if (startIndex == 0 && i == keyBlock.length - 1)
                        parsedFields.push(keyBlock);
                      else if (i == keyBlock.length - 1)
                        parsedFields.push(keyBlock.substring(startIndex));
                      else if (startIndex == -1) startIndex = i;
                      break;
                  }
                }

                parsedFields.forEach((parsedField) => {
                  const finalKey = keyBlock.trim();
                  const field = node.fields?.find(
                    (f) => f.name.value == parsedField,
                  );
                  let fieldType = '';
                  if (field)
                    fieldType =
                      WorkbenchFederationProvider.getFieldTypeString(field);

                  if (entity.keys[finalKey])
                    entity.keys[finalKey].push({
                      field: parsedField,
                      type: fieldType,
                    });
                  else
                    entity.keys[finalKey] = [
                      { field: parsedField, type: fieldType },
                    ];
                });
              }

              if (Object.keys(entity.keys).length > 0) {
                if (!extendables[joinGraphEnumValue])
                  extendables[joinGraphEnumValue] = [entity];
                else extendables[joinGraphEnumValue].push(entity);
              }
            }
          });
        },
        EnumTypeDefinition(node) {
          if (node.name.value == 'join__Graph') {
            node.values?.forEach((enumValueDefinition) => {
              joinGraphEnumValues[enumValueDefinition.name.value] = (
                enumValueDefinition.directives
                  ?.find((d) => d.name.value == 'join__graph')
                  ?.arguments?.find((a) => a.name.value == 'name')
                  ?.value as StringValueNode
              )?.value;
            });
          }
        },
      });
      Object.keys(extendables).forEach((k) => {
        extendables[joinGraphEnumValues[k]] = extendables[k];
        delete extendables[k];
      });
    } catch (err: any) {
      log(err);
    }

    return extendables;
  }
  private static getFieldTypeString(field): string {
    switch (field.kind) {
      case 'FieldDefinition':
        return this.getFieldTypeString(field.type);
      case 'ListType':
        return `[${this.getFieldTypeString(field.type)}]`;
      case 'NamedType':
        return field.name.value;
      //Need to add the ! for NonNull
      case 'NonNullType':
        switch (field.type.kind) {
          case 'ListType':
            return `${this.getFieldTypeString(field.type)}!`;
          case 'NamedType':
            return `${field.type.name.value}!`;
        }
        return '';
      default:
        return '';
    }
  }
}
