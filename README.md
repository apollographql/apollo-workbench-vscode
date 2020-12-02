# Apollo Workbench for VS Code

To get the most out of GraphQL, your organization should expose a single data graph that provides a unified interface for querying any combination of your backing data sources. However, it can be challenging to represent an enterprise-scale data graph with a single, monolithic GraphQL server. Apollo Federation enables you to divide your graph's implementation across multiple composable services and Workbench is the tool to help you design that out with only schema files.

TODO - Add Gif

The Apollo Workbench extension for VS Code brings an all-in-one tooling experience for developing federated graphs.

- Creating and working with `.apollo-workbench` files
- Mocking `.apollo-workbench` files
- Providing composition errors in **Problems** panel within VS Code
- Create and edit GraphQL operations for a loaded `.apollo-workbench` file
- With a fully composed graph, view generated query plans for defined GraphQL operations
- **Apollo Studio Integration**
  - Create a `.apollo-workbench` file from a graph that has been pushed into the schema registry (i.e. `apollo service:push`)
  - Load GraphQL operations from a graph and add them to the loaded `.apollo-workbench` file.

## Getting Started

1. Open VS Code with any folder (a dialog will display if you don't have a folder open)

![No folder open](https://storage.googleapis.com/apollo-workbench-vscode/workbench-no-folder-open.png)

2. Go to your [personal settings in Apollo Studio](https://studio.apollographql.com/user-settings) and copy your user api key. Paste your api key into the extension (which will be saved to your VS Code global state)

![Enter Apollo User API Key](https://storage.googleapis.com/apollo-workbench-vscode/workbench-add-api-key.png)

3. Create your first workbench file and get designing!

![](https://storage.googleapis.com/apollo-workbench-vscode/workbench-new-graph.png)
![](https://storage.googleapis.com/apollo-workbench-vscode/workbench-new-from-studio-graph.png)

## Features

### Mocking `.apollo-workbench` files

Apollo Workbench VS Code contains all the internals needed to mock the schemas you design out. After selecting a file in the **Local Workbench Files** tree view, each schema file in the `apollo-workbench` file can be mocked.

![Starting Mocks](https://storage.googleapis.com/apollo-workbench-vscode/workbench-start-mocks.png)

The gateway will recompose every 10 seconds (you can change this in the VS Code settings under `apollo-workbench.gatewayReCompositionInterval` - note this setting is in milliseconds). You can also stop the mocks at anytime:

![Stopping Mocks](https://storage.googleapis.com/apollo-workbench-vscode/workbench-stop-mocks.png)

### Composition Errors in the Problems Panel

Composition errors in your designed schema will be written to the **Problems** panel in VS Code:

![Composition Errors](https://storage.googleapis.com/apollo-workbench-vscode/workbench-composition-errors.png)

_Note: Since this is the beta release, some of the composition error pointers might be broken - like having the wrong range selected. All `workbench.graphql` errors won't point at the correct file as the proper `serviceName` needs to be identified. The error message should provide the details of what needs to be done. Stay tuned for more fixes in this area_

### Loading GraphQL operaitons from Apollo Studio into workbench

You can load all of the operaitons for a given graph into the **Apollo Studio Graph Operations** tree view by clicking on a graph in the **Apollo Studio Graphs**:

![Loading Operations](https://storage.googleapis.com/apollo-workbench-vscode/workbench-loading-operations.gif)

You may see some operations that have the same name, but different `id`'s next to them. This means the operations had different signatures and are different shapes. To load any operation into the current selected workbench, either right click the operation or press the plus button on the row:

![Add Operation from Studio](https://storage.googleapis.com/apollo-workbench-vscode/workbench-add-operation-from-studio.png)

### View query plan for an operation

Everytime you make a change to any operation in the current loaded workbench will try generating a new query plan for it. If you have a graph with composition errors, you'll need to resolve those composition errors before you can view the query plan of the given operatiion. To view the query plan, either right click the operation and select **Open Query Plan** or click the query plan icon in the row:

![View Query Plan](https://storage.googleapis.com/apollo-workbench-vscode/workbench-view-query-plan.png)

## Troubleshooting

This is an early beta release that was designed and written by the Apollo Solutions team, you should expect to see some bugs. If you don't, well that's fantstic!

This extension works by using a `.workbench` folder behind the scenes to manage everything. You can find `queries` and `schemas` folders that contain the files of the loaded workbench file. The `schemas` folder will contain all of the schema files (which should be identical to what is in the workbench file) and the `queries` folder should contain a query and queryplan (if graph composed successfully) for each operation defined in the workbench.

## Reference

### Extension Settings

To be outlined

### What is a .apollo-workbench file?

The `.apollo-workbench` file format contains all of the information needed for workbench to function and is structured as follows:

```
export class ApolloWorkbench {
	graphName: string = "";
	operations: { [key: string]: string } = {};
	queryPlans: { [key: string]: string } = {};
	schemas: { [serviceName: string]: WorkbenchSchema } = {};
	composedSchema: string = "";
}
export class WorkbenchSchema {
	url?: string = "";
	sdl: string = "";
	shouldMock: boolean = true;
}
```

The `.apollo-workbench` file was designed to be easily shared so that you can design out a graph and send the file to a colleague for collaboration.
