export interface RequiredHeader {
  key: string;
  value?: string;
}

export interface WorkbenchSchema {
  url?: string;
  sdl: string;
  autoUpdateSchemaFromUrl: boolean;
}

export class WorkbenchOperation {
  operation: string = '';
  remoteVisualDesignURL?: string;
}

export class ApolloWorkbenchFile {
  operations: { [opName: string]: string | WorkbenchOperation } = {};
  queryPlans: { [opName: string]: string } = {};
  schemas: { [serviceName: string]: WorkbenchSchema } = {};
  supergraphSdl = '';
  federation: string = '2';

  constructor(public graphName: string) {}
}

///This is the user facing settings displayed
export class WorkbenchSettings {
  url = '';
}
