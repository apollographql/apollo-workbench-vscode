# Apollo Solutions Tooling - Workbench for VS Code

Workbench is a tool built by the Apollo Solutions Team to help design schemas using Apollo Federation and work with the composed results. This need was driven by working countless number of migrations from an existing GraphQL infrastructure (monolith or schema stitched) to an [Apollo Federated architecture](https://www.apollographql.com/docs/federation/).

## Apollo Solutions Team

The Apollo Solutions Team is considered Apollo's first customer. We work with our customers on their graph implementations and every organization has unique challenges (along with a lot of [common ones](https://www.apollographql.com/guide)). When these challenges surface, we sometimes build some tooling or example to solve that unique challenge. This could incorporate many elements of the various Apollo OSS libraries. If you're interested in learning more about the Apollo Solutions Team and an Enterprise relationship with Apollo, please [reach out through our website](https://www.apollographql.com/contact-sales).

## What can you expect from this repo/tool?

This is a tool that is maintained by the Apollo Solutions Team, it is not a supported piece of the Apollo Platform (you can't open a Zendesk ticket for something wrong with this tool). Workbench is built on top of the Apollo OSS libraries and is an example of the type of tooling that is possible due to the declarative nature of Apollo Federation.

If you have any issues, feel free to open an issue or PR and we'll try to evolve the tool to support designing a federated schema. There have been multiple additions to support mocking scenarios and we're very interested in hearing any ideas that might help with schema design.

## What is Apollo Workbench for VS Code?

To get the most out of GraphQL, your organization should expose a single data graph that provides a unified interface for querying any combination of your backing data sources. However, it can be challenging to represent an enterprise-scale data graph with a single, monolithic GraphQL server. Apollo Federation enables you to divide your graph's implementation across multiple composable services and Workbench is the tool to help you design that out with only schema files.

The Apollo Workbench extension for VS Code brings an all-in-one tooling experience for developing federated graphs.

- Creating and working with `.apollo-workbench` files
- Mocking `.apollo-workbench` files
  - Supports remote URLs for any defined service
- Providing composition errors in **Problems** panel within VS Code
- Create and edit GraphQL operations for a loaded `.apollo-workbench` file
- With a fully composed graph, view generated query plans for defined GraphQL operations
- **Apollo Studio Integration**
  - Create a `.apollo-workbench` file from a graph that has been pushed into the schema registry (i.e. `apollo service:push`)
  - Load GraphQL operations from a graph and add them to the loaded `.apollo-workbench` file.

## Getting Started

### Setup

- [Install VS Code](https://code.visualstudio.com/download)
- Download the latest [Apollo Workbench Release](https://github.com/apollographql/apollo-workbench-vscode/releases)
- Open VS Code and click on the Extension icon
- Click on the three dots at the top of the Extension view and select "Install from VSIX"
  - Select the downlaoded Apollo Workbench Release

### Logging in

1. Open VS Code with any folder (a dialog will display if you don't have a folder open)

![No folder open](https://storage.googleapis.com/apollo-workbench-vscode/workbench-no-folder-open.png)

2. Go to your [personal settings in Apollo Studio](https://studio.apollographql.com/user-settings) and copy your user api key. Paste your api key into the extension (which will be saved to your VS Code global state)

![Enter Apollo User API Key](https://storage.googleapis.com/apollo-workbench-vscode/workbench-add-api-key.png)

## Supported Workflows

### Designing a new federated graph with no existing GraphQL

1. Create a new workbench file
   ![](https://storage.googleapis.com/apollo-workbench-vscode/workbench-new-graph.png)
2. Click on the newly created workbench file to load it
3. Start creating services

### Designing a new federated graph from an existing GraphQL monolith

1. Create a new workbench file (see screenshot above)
2. Create a new service to represent the "monolith"
   ![](https://storage.googleapis.com/apollo-workbench-vscode/workbench-migration-new-monolith.png)
   3a. If your monolith has introspection enabled and available on the network you're connected to, you can right click on the monolith and select **Update Schema from URL**. You will be prompted to enter the url for your service and the schema will be fetched and populate the monolith.graphql schema file.
   ![](https://storage.googleapis.com/apollo-workbench-vscode/workbench-migration-monolith-schemaFromUrl.png)
   3b. If you encounter an issue in 3a, you can just copy the schema into the monolith.graphql file that you created.
3.

### Designing a change to an existing graph in Apollo Studio

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

### Writing GraphQL Operations in workbench

If you have a valid fully composed schema, you should get intellisense when writing your queries with feedback in the Problems panel.

![](https://storage.googleapis.com/apollo-workbench-vscode/workbench-first-operation.png)

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

**To be outlined**

- `apollo-workbench.gatewayPort`_(**Default**: 4000)_: Specifies the url endpoint to be used for the Apollo Gateway instance when running mocks
- `apollo-workbench.startingServerPort`_(**Default**: 4001)_: Specifies the starting port to be used in the url endpoint for the mocked federated services
-       "apollo-workbench.gatewayPort": {
          "type": [
            "number"
          ],
          "default": 4000,
          "description": "Specifies the url endpoint to be used for the Apollo Studio Graph"
        },
        "apollo-workbench.startingServerPort": {
          "type": [
            "number"
          ],
          "default": 4001,
          "description": "Specifies the url endpoint to be used for the Apollo Studio Graph"
        },
        "apollo-workbench.gatewayReCompositionInterval": {
          "type": [
            "number"
          ],
          "default": 10000,
          "description": "Specifies the interval the Apollo Gateway will try re-composing it's schema in ms"
        },
        "apollo-workbench.graphApiKey": {
          "type": [
            "string"
          ],
          "default": "",
          "description": "Specifies the gateway apikey to be used for the Apollo Studio Graph. This will enable operation registry if `apollo-workbench.runOperationRegistry` is set to `true`"
        },
        "apollo-workbench.graphVariant": {
          "type": [
            "string"
          ],
          "default": "current",
          "description": "Specifies the gateway graph variant to be used for the Apollo Studio Graph. This will change operation registry if `apollo-workbench.runOperationRegistry` is set to `true`"
        },
        "apollo-workbench.daysOfOperationsToFetch": {
          "type": [
            "number"
          ],
          "default": 30,
          "description": "Specifies the number of days to select operations from Apollo Studio (to current day)"
        },
        "apollo-workbench.runOperationRegistry": {
          "type": [
            "boolean"
          ],
          "default": false,
          "description": "Specifies the url endpoint to be used for the Apollo Studio Graph"
        },
        "apollo-workbench.displayGettingStarted": {
          "type": [
            "boolean"
          ],
          "default": true,
          "description": "Specifies whether to display the 'Getting Started' section is shown in the 'Local Schema Files' TreeView"
        },
        "apollo-workbench.displayExampleGraphs": {
          "type": [
            "boolean"
          ],
          "default": true,
          "description": "Specifies whether to display the 'Example Graphs' section is shown in the 'Apollo Studio Graphs' TreeView"
        },
        "apollo-workbench.tlsRejectUnauthorized": {
          "type": [
            "boolean"
          ],
          "default": false,
          "description": "Specifies whether to set `NODE_TLS_REJECT_UNAUTHORIZED=0` or not. `NODE_TLS_REJECT_UNAUTHORIZED=0` is the default to avoid enterprise cert issues in development - Note this should never be done in production"
        },
        "apollo-workbench.headersToForwardFromGateway": {
          "type": "array",
          "default": [],
          "description": "Specifies what headers should be forwarded from the gateway to downstream mocked services"
        }

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
