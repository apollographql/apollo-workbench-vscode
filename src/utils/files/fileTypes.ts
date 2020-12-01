export interface WorkbenchSchema {
    url?: string;
    sdl: string;
    shouldMock: boolean;
}

export class ApolloWorkbenchFile {
    graphName: string = "";
    operations: { [opName: string]: string } = {};
    queryPlans: { [opName: string]: string } = {};
    schemas: { [serviceName: string]: WorkbenchSchema } = {};
    composedSchema: string = "";
}