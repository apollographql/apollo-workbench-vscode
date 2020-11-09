## Apollo Workbench VSCode 0.0.8

### Improvements

- Centralized `StateManager` for all files and `TreeViewDataProviders` - stability enhancement
- Errors displaced in `Problems` pad, but need federation errors to return `serviceName` and `loc` reliably

### Bugs

- Apollo Studio login wasn't displaying org with graphs

## Apollo Workbench VSCode 0.0.4

### Improvements

- Introduce settings for extension:
  - `apollo-workbench.apolloApiUrl`: URL used for Apollo Studio API. Primary use case is to point at Apollo Studio staging url
  - `apollo-workbench.gatewayPort`: Port to be used to run the Apollo Gateway in background
  - `apollo-workbench.startingServerPort`: Starting port to be used for mocked services. Sequential ports will be used for additional schemas that are mocked.
- Compressed workbench watch folders into one `.workbench` folder
- Centralized strings for folder locations

## Apollo Workbench VSCode 0.0.3

### Improvements

- Add delete functionality to operations
- Integrate loading Apollo Studio graph operations
  - Introduced new `TreeView` for a set of operations from a specific Apollo Studio graph (must be logged in)
  - View queryplan implemented, but doesn't account for operations created outside of workbench context. Need more logging here
- Started centralizing file watching/CRUD activities in `fileWatchManager`

## Apollo Workbench VSCode 0.0.2

This beta release has the minimum functionality for workbench:

- Start/Stop workbench mocking through folder watching
- Add/Edit/Delete schemas from current workbench file loaded
- Add/Edit operation - (delete operation and view queryPlan to be added)
- List all workbench files in vscode opened directory (show individual schemas for each one)
- Apollo Studio integration by adding user api key and listing available graphs for a given account (includes creating workbench file from a graph or adding a graph service to the current workbench file)
