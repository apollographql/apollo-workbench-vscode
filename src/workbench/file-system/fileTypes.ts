export interface RequiredHeader {
  key: string;
  value?: string;
}

export interface WorkbenchSchema {
  url?: string;
  sdl: string;
  shouldMock: boolean;
  autoUpdateSchemaFromUrl: boolean;
  requiredHeaders?: [RequiredHeader?];
  //this will be serialized into javascript using eval
  customMocks?: string;
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
  federation: string = '1';

  constructor(public graphName: string) {}
}

///This is the user facing settings displayed
export class WorkbenchSettings {
  url = '';
  requiredHeaders?: [RequiredHeader?];
  mocks: {
    shouldMock: boolean;
    autoUpdateSchemaFromUrl: boolean;
  } = { shouldMock: true, autoUpdateSchemaFromUrl: false };
}
