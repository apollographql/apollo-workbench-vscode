import { GraphQLSchema, Kind, Source } from 'graphql';
import {
  Diagnostic,
  DiagnosticCollection,
  DiagnosticSeverity,
  languages,
  Range,
  Uri,
} from 'vscode';
import { ApolloConfig } from './file-system/ApolloConfig';
import {
  RoverCompositionError,
} from './file-system/CompositionResults';
import { schemaFileUri, tempSchemaFilePath } from './file-system/fileProvider';
import { StateManager } from './stateManager';
import { getFileName } from '../utils/path';

interface WorkbenchDiagnosticCollections {
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
        compositionDiagnostics,
      });
    }
  }

  async setCompositionErrors(
    wbFilePath: string,
    wbFile: ApolloConfig,
    errors: RoverCompositionError[],
  ) {
    const compositionDiagnostics = this.getCompositionDiagnostics(wbFilePath);
    compositionDiagnostics.clear();

    const diagnosticsGroups = this.handleErrors(wbFilePath, errors);
    for (const sn in diagnosticsGroups) {
      const subgraph = wbFile.subgraphs[sn];
      if (subgraph) {
        if (subgraph.schema.file) {
          compositionDiagnostics.set(
            schemaFileUri(subgraph.schema.file, wbFilePath),
            diagnosticsGroups[sn],
          );
        }
        else if(subgraph.schema.workbench_design){
          compositionDiagnostics.set(
            schemaFileUri(subgraph.schema.workbench_design, wbFilePath),
            diagnosticsGroups[sn],
          );
        }
        //    Account for a local change to remote source that we can't edit
        else {
          compositionDiagnostics.set(tempSchemaFilePath(wbFilePath, sn), diagnosticsGroups[sn]);
        }
      } else {
        compositionDiagnostics.set(
          Uri.parse(wbFilePath),
          diagnosticsGroups[sn],
        );
      }
    }
  }

  clearCompositionDiagnostics(wbFilePath: string) {
    this.getCompositionDiagnostics(wbFilePath).clear();
  }
  clearAllDiagnostics() {
    this.diagnosticCollections.forEach((diagnosticCollection) => {
      diagnosticCollection.compositionDiagnostics.clear();
    });
  }
  private getCompositionDiagnostics(wbFilePath: string): DiagnosticCollection {
    return this.getWorkbenchDiagnostics(wbFilePath).compositionDiagnostics;
  }
  private getWorkbenchDiagnostics(wbFilePath: string) {
    const wbFileDiagnostics = this.diagnosticCollections.get(wbFilePath);
    if (wbFileDiagnostics != undefined) return wbFileDiagnostics;
    else throw new Error(`No Operation Diagnostic found for ${wbFilePath}`);
  }
  private handleErrors(wbFilePath: string, errors: RoverCompositionError[]) {
    const diagnosticsGroups: { [key: string]: Diagnostic[] } = {};

    for (let i = 0; i < errors.length; i++) {
      const error = errors[i];
      const errorMessage = error.message;

      error.nodes.forEach((errorNode) => {
        const subgraphName = errorNode.subgraph ?? getFileName(wbFilePath);
        //TODO - Need all of locs info from harmonizer, the offset looks like it's important
        const range = new Range(
          errorNode.start.line - 1,
          errorNode.start.column - 1,
          errorNode.end.line - 1,
          errorNode.start.column + errorNode.end.column - 1,
        );
        const diagnostic = new Diagnostic(
          range,
          errorMessage,
          DiagnosticSeverity.Error,
        );

        if (!diagnosticsGroups[subgraphName])
          diagnosticsGroups[subgraphName] = [diagnostic];
        else diagnosticsGroups[subgraphName].push(diagnostic);
      });
    }

    return diagnosticsGroups;
  }
}
