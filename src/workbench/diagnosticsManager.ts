import { GraphQLError, GraphQLSchema, Kind, Source } from 'graphql';
import {
  commands,
  Diagnostic,
  DiagnosticCollection,
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  languages,
  Position,
  Range,
  Uri,
} from 'vscode';
import { getTypeUsageRanges } from '../graphql/parsers/schemaParser';
import { log } from '../utils/logger';
import { collectExecutableDefinitionDiagnositics } from '../utils/operation-diagnostics/diagnostics';
import { GraphQLDocument } from '../utils/operation-diagnostics/document';
import { WorkbenchFederationProvider } from './federationProvider';
import { FileProvider } from './file-system/fileProvider';
import { ApolloWorkbenchFile } from './file-system/fileTypes';
import { WorkbenchUri, WorkbenchUriType } from './file-system/WorkbenchUri';
import { StateManager } from './stateManager';

interface WorkbenchDiagnosticCollections {
  operationDiagnostics: DiagnosticCollection;
  compositionDiagnostics: DiagnosticCollection;
}

export class WorkbenchDiagnostics {
  public static instance: WorkbenchDiagnostics = new WorkbenchDiagnostics();

  diagnosticCollections: Map<string, WorkbenchDiagnosticCollections> = new Map<
    string,
    WorkbenchDiagnosticCollections
  >();

  createWorkbenchFileDiagnostics(graphName: string, wbFilePath: string) {
    if (this.diagnosticCollections.has(wbFilePath)) {
      const collection = this.getWorkbenchDiagnostics(wbFilePath);
      collection?.compositionDiagnostics.clear();
      collection?.operationDiagnostics.clear();
    } else {
      const compositionDiagnostics = languages.createDiagnosticCollection(
        `${graphName}-composition`,
      );
      const operationDiagnostics = languages.createDiagnosticCollection(
        `${graphName}-composition`,
      );

      StateManager.instance.context?.subscriptions.push(compositionDiagnostics);
      StateManager.instance.context?.subscriptions.push(operationDiagnostics);

      this.diagnosticCollections.set(wbFilePath, {
        operationDiagnostics,
        compositionDiagnostics,
      });
    }
  }

  setCompositionErrors(
    wbFilePath: string,
    wbFile: ApolloWorkbenchFile,
    errors: GraphQLError[],
  ) {
    const compositionDiagnostics = this.getCompositionDiagnostics(wbFilePath);
    compositionDiagnostics.clear();

    const diagnosticsGroups = this.handleErrors(wbFilePath, wbFile, errors);
    for (const sn in diagnosticsGroups) {
      if (sn.toLowerCase() == 'workbench')
        compositionDiagnostics.set(
          Uri.parse(wbFilePath),
          diagnosticsGroups[sn],
        );
      else
        compositionDiagnostics.set(
          WorkbenchUri.supergraph(wbFilePath, sn, WorkbenchUriType.SCHEMAS),
          diagnosticsGroups[sn],
        );
    }

    // if (Object.keys(diagnosticsGroups).length > 0)
    //   commands.executeCommand('workbench.action.problems.focus', '1 == 2');
  }

  validateAllOperations(wbFilePath: string) {
    const wbFileUri = Uri.parse(wbFilePath);
    const workbenchFile = FileProvider.instance.workbenchFileFromPath(
      wbFileUri.path,
    );
    if (workbenchFile) {
      if (Object.keys(workbenchFile.operations).length == 0) {
        this.getOperationDiagnostics(wbFilePath).clear();
      } else {
        Object.keys(workbenchFile.operations).forEach((opName) => {
          const op = workbenchFile.operations[opName];
          const operation = typeof op == 'string' ? op : op.operation;

          this.validateOperation(opName, operation, wbFilePath);
        });
      }
    }
  }
  validateOperation(opName: string, operation: string, wbFilePath: string) {
    const schema = StateManager.instance.workspaceState_schema;
    const operationDiagnostic = this.getOperationDiagnostics(wbFilePath);

    const opDiagnostics = this.collectOperationDiagnostics(operation, schema);

    const operationUri = WorkbenchUri.supergraph(
      wbFilePath,
      opName,
      WorkbenchUriType.QUERIES,
    );

    if (opDiagnostics.length > 0) {
      const diagnostics = new Array<Diagnostic>();
      opDiagnostics.forEach((opDiag) => {
        const start = opDiag.range.start;
        const end = opDiag.range.end;
        const range = new Range(
          new Position(start.line, start.character),
          new Position(end.line, end.character),
        );
        diagnostics.push(
          new Diagnostic(range, opDiag.message, opDiag.severity),
        );
      });
      operationDiagnostic.set(operationUri, diagnostics);
    } else {
      operationDiagnostic.set(operationUri, undefined);
    }
  }
  clearOperationDiagnostics(wbFilePath: string) {
    this.getOperationDiagnostics(wbFilePath).clear();
  }
  clearCompositionDiagnostics(wbFilePath: string) {
    this.getCompositionDiagnostics(wbFilePath).clear();
  }
  clearAllDiagnostics() {
    this.diagnosticCollections.forEach((diagnosticCollection) => {
      diagnosticCollection.compositionDiagnostics.clear();
      diagnosticCollection.operationDiagnostics.clear();
    });
  }
  private collectOperationDiagnostics(
    operation: string,
    schema: GraphQLSchema,
  ) {
    const document = new GraphQLDocument(new Source(operation));
    const fragments = Object.create(null);
    if (document.ast) {
      for (const definition of document.ast.definitions) {
        if (definition.kind === Kind.FRAGMENT_DEFINITION) {
          fragments[definition.name.value] = definition;
        }
      }
    }
    try {
      return collectExecutableDefinitionDiagnositics(
        schema,
        document,
        fragments,
      );
    } catch (err) {
      //`collectExecutableDefinitionDiagnositics` returns errors from GraphQL that can be unhelpful for out case
      return [];
    }
  }
  private getOperationDiagnostics(wbFilePath: string): DiagnosticCollection {
    return this.getWorkbenchDiagnostics(wbFilePath)?.operationDiagnostics;
  }
  private getCompositionDiagnostics(wbFilePath: string): DiagnosticCollection {
    return this.getWorkbenchDiagnostics(wbFilePath).compositionDiagnostics;
  }
  private getWorkbenchDiagnostics(wbFilePath: string) {
    const wbFileDiagnostics = this.diagnosticCollections.get(wbFilePath);
    if (wbFileDiagnostics != undefined) return wbFileDiagnostics;
    else throw new Error(`No Operation Diagnostic found for ${wbFilePath}`);
  }
  private handleErrors(
    wbFilePath: string,
    wb: ApolloWorkbenchFile,
    errors: GraphQLError[],
  ) {
    const schemas = wb.schemas;
    const diagnosticsGroups: { [key: string]: Diagnostic[] } = {};

    const compiledSchemas: { [subgraphName: string]: string } = {};
    Object.keys(schemas).forEach((subgraphName) => {
      if (schemas[subgraphName].sdl) {
        try {
          compiledSchemas[subgraphName] =
            WorkbenchFederationProvider.normalizeSchema(
              schemas[subgraphName].sdl,
            );
        } catch (err: any) {
          compiledSchemas[subgraphName] = schemas[subgraphName].sdl;
        }
      }
    });

    for (let i = 0; i < errors.length; i++) {
      const error = errors[i];
      const errorMessage = error.message;
      let diagnosticCode = '';
      let range = new Range(0, 0, 0, 1);
      let serviceName: string = (error.extensions as any)?.subgraph ?? 'workbench';

      if (error.locations && error.locations.length > 0) {
        const location = error.locations[0];
        range = new Range(location.line - 1, location.column - 1, location.line - 1, location.column)
      }

      const diagnostic = new Diagnostic(
        range,
        errorMessage,
        DiagnosticSeverity.Error,
      );

      if (error.nodes) {
        error.nodes.forEach((node) => {
          const nodeLoc = node.loc;
          if (nodeLoc?.source.body) {
            const normalizedSource =
              WorkbenchFederationProvider.normalizeSchema(nodeLoc?.source.body);
            for (const subgraphName in wb.schemas) {
              if (normalizedSource == compiledSchemas[subgraphName]) {
                //Create and add a diagnostic
                const diagnostic = new Diagnostic(
                  new Range(
                    nodeLoc?.startToken.line ? nodeLoc?.startToken.line - 1 : 0,
                    nodeLoc?.startToken.start
                      ? nodeLoc?.startToken.column - 1
                      : 0,
                    nodeLoc?.endToken.line ? nodeLoc?.endToken.line - 1 : 0,
                    nodeLoc?.endToken.end ? nodeLoc?.endToken.column - 1 : 1,
                  ),
                  errorMessage,
                  DiagnosticSeverity.Error,
                );
                if (!diagnosticsGroups[subgraphName])
                  diagnosticsGroups[subgraphName] = new Array<Diagnostic>();

                diagnosticsGroups[subgraphName].push(diagnostic);
              }
            }
          } else {
            log('UNHANDLED ERROR WITH NODE');
          }
        });
      } else if (error.extensions) {
        if (error.extensions?.noServicesDefined) {
          const emptySchemas = `"schemas":{}`;
          const schemasIndex = 0;
          range = new Range(
            0,
            schemasIndex,
            0,
            schemasIndex + emptySchemas.length,
          );
        } else if (
          error.extensions?.noSchemaDefined ||
          error.extensions?.invalidSchema
        ) {
          if (error.extensions?.unexpectedName) {
            // const unexpectedName = error.extensions.unexpectedName;
            //TODO: exception has details
            // const location = error.extensions.exception..locations[0];
            // const lineNumber = location.line - 1;
            // const textIndex = location.column - 1;

            // if (unexpectedName == '[') diagnosticCode = 'makeArray:deleteRange';
            // else diagnosticCode = 'deleteRange';

            // range = new Range(
            //   lineNumber,
            //   textIndex,
            //   lineNumber,
            //   textIndex + unexpectedName.length,
            // );
          } else if (error.extensions.noFieldsDefined) {
            //TODO: exception has details
            // const location = error.extensions.locations[0];
            // const lineNumber = location.line - 1;

            // range = new Range(lineNumber - 1, 0, lineNumber, 0);
          }
        }
      } else if (
        errorMessage.includes('Type Query must define one or more fields')
      ) {
        const serviceNames = Object.keys(schemas);
        if (serviceNames.length >= 1) {
          serviceName = serviceNames[0];
        }
      } else if (errorMessage.includes('Unknown type: ')) {
        const splitMessage = errorMessage.split('"');
        const unknownType = splitMessage[1];

        for (const sn in schemas) {
          const schema = schemas[sn].sdl;
          if (
            schema.includes(unknownType) &&
            !schema.includes(`type ${unknownType}`)
          ) {
            serviceName = sn;
          }
        }

        if (serviceName) continue;

        const typeUsage = getTypeUsageRanges(
          unknownType,
          schemas[serviceName].sdl,
        );
        if (typeUsage.length > 0) {
          diagnostic.relatedInformation = [];
          const uri = WorkbenchUri.supergraph(
            wbFilePath,
            serviceName,
            WorkbenchUriType.SCHEMAS,
          );
          typeUsage.forEach((range) => {
            const location = {
              range,
              uri,
            };
            diagnostic.relatedInformation?.push(
              new DiagnosticRelatedInformation(location, errorMessage),
            );
          });
        }
      }

      //If we have multiple services, we'll need to create multiple diagnostics
      if (serviceName.includes('-:-')) {
        const services = serviceName.split('-:-');
        services.map((s) => {
          if (s) {
            const diagnostic = new Diagnostic(
              range,
              errorMessage,
              DiagnosticSeverity.Error,
            );
            if (!diagnosticsGroups[s])
              diagnosticsGroups[s] = new Array<Diagnostic>();

            diagnosticsGroups[s].push(diagnostic);
          }
        });
      } else {
        if (diagnosticCode) diagnostic.code = diagnosticCode;
        diagnostic.range = range;

        if (!diagnosticsGroups[serviceName])
          diagnosticsGroups[serviceName] = new Array<Diagnostic>();
        diagnosticsGroups[serviceName].push(diagnostic);
      }
    }

    return diagnosticsGroups;
  }
}
