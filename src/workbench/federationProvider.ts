import { composeAndValidate, ServiceDefinition } from '@apollo/federation';
import {
  buildOperationContext,
  buildComposedSchema,
  QueryPlanner,
  serializeQueryPlan,
} from '@apollo/query-planner';
import {
  CompositionFailure,
  CompositionResult,
} from '@apollo/federation/dist/composition/utils';
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
} from 'graphql';
import {
  ApolloWorkbenchFile,
  RequiredHeader,
  WorkbenchOperation,
} from './file-system/fileTypes';
import { FieldWithType } from './federationCompletionProvider';
import { RemoteGraphQLDataSource } from '@apollo/gateway';
import { FileProvider } from './file-system/fileProvider';
import { log } from '../utils/logger';

export class WorkbenchFederationProvider {
  static compose(workbenchFile: ApolloWorkbenchFile) {
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
        } catch (err) {
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
      return { errors } as CompositionFailure;
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

      return { ...compositionResults } as CompositionResult;
    }
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
      workbenchFile.supergraphSdl,
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
      const { data, errors } = await source.process({ request, context: {} });

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
    } catch (err) {
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

    const { data, errors } = await source.process({ request, context: {} });
    if (data && !errors) {
      const schema = buildClientSchema(data as any);

      return printSchema(schema);
    } else if (errors) {
      errors.map((error) => log(error.message));
    }
  }
  private static createQueryPlan(operation: string, supergraphSDL: string) {
    try {
      const schema = buildComposedSchema(parse(supergraphSDL));
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
      const queryPlanner = new QueryPlanner(schema);
      const queryPlan = queryPlanner.buildQueryPlan(operationContext, {
        autoFragmentization: false,
      });
      const queryPlanString = serializeQueryPlan(queryPlan);

      return queryPlanString;
    } catch (err) {
      log(err);
      return '';
    }
  }
  static extractDefinedEntitiesByService(workbenchFile: ApolloWorkbenchFile) {
    const extendables: {
      [serviceName: string]: {
        type: string;
        keys: { [key: string]: FieldWithType[] };
      }[];
    } = {};
    const joinGraphEnumValues: { [joinGraphEnum: string]: string } = {};

    try {
      if (workbenchFile) {
        visit(parse(workbenchFile.supergraphSdl), {
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
                        (a.value as StringValueNode)?.value ==
                          joinGraphEnumValue,
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
      }
    } catch (err) {
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
