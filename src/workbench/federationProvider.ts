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

//Federation 1
import { GraphQLDataSourceRequestKind as GraphQLDataSourceRequestKind_1 } from '@apollo/gateway-1/dist/datasources/types';
import { RemoteGraphQLDataSource } from '@apollo/gateway-1';
import { composeAndValidate, ServiceDefinition } from '@apollo/federation-1';
import {
  buildOperationContext,
  buildComposedSchema,
  QueryPlanner as QueryPlanner_1,
  serializeQueryPlan,
} from '@apollo/query-planner-1';
import { defaultRootOperationTypes as defaultRootOperationTypes_1 } from '@apollo/federation-2/dist/composition/normalize';
import {
  CompositionFailure as CompositionFailure_1,
  CompositionResult as CompositionResult_1,
  CompositionSuccess as CompositionSuccess_1,
} from '@apollo/federation-1/dist/composition/utils';

//Federation 2
import {
  compose,
  CompositionFailure as CompositionFailure_2,
  CompositionResult as CompositionResult_2,
  CompositionSuccess as CompositionSuccess_2,
} from '@apollo/composition';
import { defaultRootOperationTypes as defaultRootOperationTypes_2 } from '@apollo/federation-2/dist/composition/normalize';
import {
  buildSchema,
  federationBuiltIns,
  parseOperation,
  Subgraph,
  Subgraphs,
} from '@apollo/federation-internals';
import { QueryPlanner as QueryPlanner_2 } from '@apollo/query-planner-2';

export class WorkbenchFederationProvider {
  static getSchemaFromResults(
    compResults: CompositionResult_1 | CompositionResult_2,
  ) {
    const results = compResults as any;
    if ((compResults as any).hints) {
      return (results as CompositionSuccess_2).schema.toGraphQLJSSchema();
    } else {
      return (results as CompositionSuccess_1).schema;
    }
  }
  static compose(
    workbenchFile: ApolloWorkbenchFile,
  ):
    | CompositionResult_1
    | CompositionFailure_1
    | CompositionResult_2
    | CompositionFailure_2 {
    if (workbenchFile.federation == '2') {
      //Add in federation v2
      return WorkbenchFederationProvider.compose_fed_2(workbenchFile);
    } else {
      return WorkbenchFederationProvider.compose_fed_1(workbenchFile);
    }
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
      return { errors } as CompositionFailure_2;
    } else {
      try {
        const subgraphs: Subgraphs = new Subgraphs();

        for (const key in workbenchFile.schemas) {
          const url = workbenchFile.schemas[key].url ?? 'http://localhost';
          const localSchemaString = workbenchFile.schemas[key].sdl;
          if (localSchemaString) {
            try {
              // const printedSchema = WorkbenchFederationProvider.normalizeSchema(localSchemaString);
              const builtSchema = buildSchema(
                localSchemaString,
                federationBuiltIns,
              );
              const subgraph = new Subgraph(key, url, builtSchema);
              subgraphs.add(subgraph);
            } catch (err: any) {
              log(err.message);
              if (err.causes) {
                err.causes.forEach((cause) => errors.push(cause));
              } else {
                errors.push(
                  new GraphQLError(
                    err.message,
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

        return { ...compositionResults } as CompositionResult_2;
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

  private static compose_fed_1(workbenchFile: ApolloWorkbenchFile) {
    const sdls: ServiceDefinition[] = [];
    const errors: GraphQLError[] = [];
    for (const key in workbenchFile.schemas) {
      const localSchemaString = workbenchFile.schemas[key].sdl;
      if (localSchemaString) {
        try {
          const doc = parse(localSchemaString);
          //TODO: use onlineParser to find validation
          sdls.push({
            name: key,
            typeDefs: doc,
            url: workbenchFile.schemas[key].url,
          });
        } catch (err: any) {
          //Need to include any errors for invalid schema
          //TODO: consider using online parser when there is a gql error to get a better placement of the error
          let errorMessage = `Not valid GraphQL Schema: ${err.message}`;
          const extensions: any = { invalidSchema: true, serviceName: key };

          if (err.message.includes('Syntax Error: Unexpected Name ')) {
            const quotedUnexpected = err.message.split(
              'Syntax Error: Unexpected Name "',
            )[1];
            const unexpectedName = quotedUnexpected.slice(
              0,
              quotedUnexpected.length - 1,
            );
            extensions.locations = err.locations;
            extensions.unexpectedName = unexpectedName;
          } else if (
            err.message.includes('Syntax Error: Expected Name, found }')
          ) {
            errorMessage = `You must define some fields: ${err.message}`;
            extensions.noFieldsDefined = true;
            extensions.locations = err.locations;
          } else if (
            err.message.includes('Syntax Error: Expected Name, found ')
          ) {
            errorMessage = `You must define some fields: ${err.message}`;
            const quotedUnexpected = err.message.split(
              'Syntax Error: Expected Name, found ',
            )[1];
            const offset = quotedUnexpected.length == 1 ? 0 : 1;
            const unexpectedName = quotedUnexpected.slice(
              0,
              quotedUnexpected.length - offset,
            );
            extensions.noFieldsDefined = true;
            extensions.locations = err.locations;
            extensions.unexpectedName = unexpectedName;
          }

          errors.push(
            new GraphQLError(
              errorMessage,
              undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              extensions,
            ),
          );
        }
      } else {
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
      return { errors } as CompositionFailure_1;
    } else {
      //This blocks UI thread, why I have no clue but it is overworking VS Code
      const compositionResults = composeAndValidate(sdls);

      if (Object.keys(workbenchFile.schemas).length == 0)
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

      return { ...compositionResults } as CompositionResult_1;
    }
  }

  static normalizeSchema(schema: string, federationComposition: string = '1') {
    let doc;
    const document = parse(schema);
    if (federationComposition == '1')
      doc = defaultRootOperationTypes_1(document);
    else doc = defaultRootOperationTypes_2(document);

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

    const requiredHeaders = workbenchFile.schemas[serviceName]?.requiredHeaders;
    const headers = new Headers();
    requiredHeaders?.forEach((requiredHeader) => {
      if (requiredHeader && requiredHeader.value)
        headers.append(requiredHeader.key, requiredHeader.value);
    });

    const source = new RemoteGraphQLDataSource({ url: serviceURLOverride });
    const request = {
      query: 'query __ApolloGetServiceDefinition__ { _service { sdl } }',
      http: {
        url: serviceURLOverride,
        method: 'POST',
        headers: headers,
      },
    } as any;

    try {
      const { data, errors } = await source.process({
        request,
        context: {},
        kind: GraphQLDataSourceRequestKind_1.HEALTH_CHECK,
      });

      if (data && !errors) {
        return data._service.sdl as string;
      } else if (errors) {
        errors.map((error) => log(error.message));
        //If we got errors, it could be that the graphql server running at that url doesn't support Apollo Federation Spec
        //  In this case, we can try and get the server schema from introspection
        return await this.getSchemaByIntrospection(
          serviceURLOverride,
          source,
          headers,
        );
      }
    } catch (err: any) {
      if (err.code == 'ECONNREFUSED')
        log(`Do you have service ${serviceName} running? \n\t${err.message}`);
      else if (err.code == 'ENOTFOUND')
        log(`Do you have service ${serviceName} running? \n\t${err.message}`);
      else if (err.message == 'Only absolute URLs are supported')
        log(`${serviceName}-${err.message}`);
      else
        return await this.getSchemaByIntrospection(
          serviceURLOverride,
          source,
          headers,
        );
    }

    return;
  }
  private static async getSchemaByIntrospection(
    serviceURLOverride: string,
    source: RemoteGraphQLDataSource,
    requiredHeaders: Headers,
  ) {
    const introspectionQuery = getIntrospectionQuery();
    const request = {
      query: introspectionQuery,
      http: {
        url: serviceURLOverride,
        method: 'POST',
        headers: requiredHeaders,
      },
    } as any;

    const { data, errors } = await source.process({
      request,
      context: {},
      kind: GraphQLDataSourceRequestKind_1.HEALTH_CHECK,
    });
    if (data && !errors) {
      const schema = buildClientSchema(data as any);

      return printSchema(schema);
    } else if (errors) {
      errors.map((error) => log(error.message));
    }
  }
  private static createQueryPlan(
    operation: string,
    workbenchFile: ApolloWorkbenchFile,
  ) {
    const supergraphSdl = workbenchFile.supergraphSdl;
    try {
      if (workbenchFile.federation == '1') {
        const schema = buildComposedSchema(parse(supergraphSdl));
        const documentNode = parse(operation);
        const operationDefinition = documentNode.definitions.find(
          (def) => def.kind === 'OperationDefinition',
        ) as any;
        const operationName = operationDefinition?.name?.value ?? '';
        const operationContext = buildOperationContext(
          schema,
          documentNode,
          operationName,
        );
        const queryPlanner = new QueryPlanner_1(schema);
        const queryPlan = queryPlanner.buildQueryPlan(operationContext, {
          autoFragmentization: false,
        });
        const queryPlanString = serializeQueryPlan(queryPlan);

        return queryPlanString;
      } else {
        const schema = buildSchema(supergraphSdl, federationBuiltIns);
        const documentNode = parse(operation);
        const operationDefinition = documentNode.definitions.find(
          (def) => def.kind === 'OperationDefinition',
        ) as any;
        const operationName = operationDefinition?.name?.value ?? '';
        const op = parseOperation(schema, operation, operationName);
        const queryPlanner = new QueryPlanner_2(schema);
        const queryPlan = queryPlanner.buildQueryPlan(op);
        const queryPlanString = serializeQueryPlan(queryPlan);

        return queryPlanString;
      }
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
