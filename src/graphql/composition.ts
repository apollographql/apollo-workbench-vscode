// import { composeAndValidate, ServiceDefinition } from '@apollo/federation';
// import { GraphQLError, parse, extendSchema, GraphQLSchema } from 'graphql';
// import { window } from 'vscode';
// import { StateManager } from '../workbench/stateManager';
// import { extractDefinedEntitiesByService } from './parsers/csdlParser';
// import { FileProvider } from '../workbench/file-system/fileProvider';
// import { ApolloWorkbenchFile } from '../workbench/file-system/fileTypes';
// import {
//   CompositionResult,
//   CompositionFailure,
// } from '@apollo/federation/dist/composition/utils';
// import { log } from '../utils/logger';
// import { WorkbenchDiagnostics } from '../workbench/diagnosticsManager';

// export function superSchemaToSchema(supergraphSchema: string) {
//   const schema = new GraphQLSchema({
//     query: undefined,
//   });
//   const parsed = parse(supergraphSchema);
//   const finalSchema = extendSchema(schema, parsed, { assumeValidSDL: true });

//   return finalSchema;
// }

// export function composeSchemaForWbFilePath(
//   wbFilePath: string,
//   shouldSave: boolean = true,
// ) {
//   const workbenchFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);
//   if (workbenchFile) {
//     return composeSchema(workbenchFile, wbFilePath, shouldSave);
//   } else return '';
// }

// export function composeSchema(
//   workbenchFile: ApolloWorkbenchFile,
//   wbFilePath: string,
//   shouldSave = true,
// ): string {
//   const compositionStatusBarItem = window.createStatusBarItem();
//   compositionStatusBarItem.text = `Composing ${workbenchFile.graphName}`;
//   compositionStatusBarItem.show();
//   try {
//     const { errors, supergraphSdl, schema } = getComposedSchema(workbenchFile);
//     //Deal with storing/clearing out the schema used for type completion/operations diagnostics
//     if (schema) StateManager.instance.workspaceState_schema = schema;
//     else StateManager.instance.clearWorkspaceSchema();

//     if (errors && errors.length > 0) {
//       log(
//         `${errors.length} composition errors found for ${workbenchFile.graphName}. See problems panel for details.`,
//       );
//       WorkbenchDiagnostics.instance.setCompositionErrors(
//         wbFilePath,
//         workbenchFile,
//         errors,
//       );
//     } else
//       WorkbenchDiagnostics.instance.clearCompositionDiagnostics(wbFilePath);

//     if (supergraphSdl) {
//       workbenchFile.supergraphSdl = supergraphSdl;

//       extractDefinedEntitiesByService(wbFilePath);
//       WorkbenchDiagnostics.instance.validateAllOperations(wbFilePath);

//       if (shouldSave)
//         FileProvider.instance.saveWorkbenchFile(
//           workbenchFile,
//           wbFilePath,
//           false,
//         );
//     } else {
//       if (workbenchFile.supergraphSdl != '') {
//         workbenchFile.supergraphSdl = '';

//         if (shouldSave)
//           FileProvider.instance.saveWorkbenchFile(
//             workbenchFile,
//             wbFilePath,
//             false,
//           );
//       }

//       //Since we don't have a valid schema, we should display
//       WorkbenchDiagnostics.instance.clearOperationDiagnostics(wbFilePath);
//     }
//   } catch (err) {
//     log(`${err}`);
//   } finally {
//     compositionStatusBarItem.dispose();

//     return workbenchFile.supergraphSdl;
//   }
// }

// export function getComposedSchema(
//   workbenchFile: ApolloWorkbenchFile,
// ): CompositionResult {
//   const sdls: ServiceDefinition[] = [];
//   const errors: GraphQLError[] = [];
//   for (const key in workbenchFile.schemas) {
//     const localSchemaString = workbenchFile.schemas[key].sdl;
//     if (localSchemaString) {
//       try {
//         const doc = parse(localSchemaString);
//         //TODO: use onlineParser to find validation
//         sdls.push({
//           name: key,
//           typeDefs: doc,
//           url: workbenchFile.schemas[key].url,
//         });
//       } catch (err) {
//         //Need to include any errors for invalid schema
//         //TODO: consider using online parser when there is a gql error to get a better placement of the error
//         let errorMessage = `Not valid GraphQL Schema: ${err.message}`;
//         const extensions: any = { invalidSchema: true, serviceName: key };

//         if (err.message.includes('Syntax Error: Unexpected Name ')) {
//           const quotedUnexpected = err.message.split(
//             'Syntax Error: Unexpected Name "',
//           )[1];
//           const unexpectedName = quotedUnexpected.slice(
//             0,
//             quotedUnexpected.length - 1,
//           );
//           extensions.locations = err.locations;
//           extensions.unexpectedName = unexpectedName;
//         } else if (
//           err.message.includes('Syntax Error: Expected Name, found }')
//         ) {
//           errorMessage = `You must define some fields: ${err.message}`;
//           extensions.noFieldsDefined = true;
//           extensions.locations = err.locations;
//         } else if (
//           err.message.includes('Syntax Error: Expected Name, found ')
//         ) {
//           errorMessage = `You must define some fields: ${err.message}`;
//           const quotedUnexpected = err.message.split(
//             'Syntax Error: Expected Name, found ',
//           )[1];
//           const offset = quotedUnexpected.length == 1 ? 0 : 1;
//           const unexpectedName = quotedUnexpected.slice(
//             0,
//             quotedUnexpected.length - offset,
//           );
//           extensions.noFieldsDefined = true;
//           extensions.locations = err.locations;
//           extensions.unexpectedName = unexpectedName;
//         }

//         errors.push(
//           new GraphQLError(
//             errorMessage,
//             undefined,
//             undefined,
//             undefined,
//             undefined,
//             undefined,
//             extensions,
//           ),
//         );
//       }
//     } else {
//       const err = 'No schema defined for service';
//       errors.push(
//         new GraphQLError(
//           err,
//           undefined,
//           undefined,
//           undefined,
//           undefined,
//           undefined,
//           { noSchemaDefined: true, serviceName: key, message: err },
//         ),
//       );
//     }
//   }
//   if (errors.length > 0) {
//     return { errors } as CompositionFailure;
//   } else {
//     //This blocks UI thread, why I have no clue but it is overworking VS Code
//     const compositionResults = composeAndValidate(sdls);

//     if (Object.keys(workbenchFile.schemas).length == 0)
//       compositionResults.errors = [
//         new GraphQLError(
//           'No schemas defined in workbench yet',
//           undefined,
//           undefined,
//           undefined,
//           undefined,
//           undefined,
//           { noServicesDefined: true },
//         ),
//       ];
//     return { ...compositionResults } as CompositionResult;
//   }
// }
