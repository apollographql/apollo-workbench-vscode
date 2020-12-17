## Apollo Workbench VSCode 0.2.x (upcoming)

- Better composition error pointing

## Apollo Workbench VSCode 0.2.8

- Upgrade Visual Indicator for loading workbench files

### Bugs

- Usage of `yield` to unblock vscode extension ui thread from `composeAndValidate` :tada:

## Apollo Workbench VSCode 0.2.7

- Local development mocking toggle options implemented
  - Needs docs
  - Can have portions of graph point at specific urls, others mocked
    - Currently no auth/header options available
- Provide visual indicators of what is going on during composition and loading of workbench file (large schemas can take a second to load)

### Known bugs

- `composeAndValidate` from `@apollo/federation` is blocking the vscode extension ui thread :bug:

## Apollo Workbench VSCode 0.2.6

- Support composite keys in intellisense :tada:

### Bugs

- CSDL file not refreshing properly. Moved to not use openTextDocument as VS Code pulls from a cache instead of consitently calling the `FileProvier.readFile`

## Apollo Workbench VSCode 0.2.5

- Added new icons
- Pretty print operations

### Bugs

- Intellisense takes along time to load with large generated csdl
  - Excessive calls to `getText` in csdlParser removed

## Apollo Workbench VSCode 0.2.3

### Improvements:

- General stability across basic functions:
  - Getting started
    - Streamlined creating new folder
    - Enter API key has feedback
  - Creating a workbench file from multiple sources
    - New (blank)
    - From Apollo Studio Graph
    - From Example Graph
  - Rename workbench files
  - Composition now updates CSDL visible if error
  - Studio graphs loading
    - Enable loading operations when clicking on any graph
    - Enable setting to change days for traces fetched from Apollo Studio
  - Studio Operations Viewing
    - Open edit-only view of graphql operations from Studio when clicking on a row in graph loaded operations

## Apollo Workbench VSCode 0.2.2

- Open any fodler

## Apollo Workbench VSCode 0.2.1

- Intellisense for writing queries

## Apollo Workbench VSCode 0.2.0

### Potential Breaking Changes

Extension now utilizes a file provider and workbench schema/query/queryplan files are no longer created in a `.workbench` folder. Any changes to a local schema file (that have not been synced to the workbench file) in previous extension versions will not update the workbench file. It is recommended to delete any `.workbench` files

### Improvements:

- Moved from chokidar to using a VSCode file provider
- Added Getting Started section to local schema files tree, auto-preview markdown files for getting started
- Mocks are no longer automatically started as they could linger in the background of a vscode window that had the extension opened at one point. Start/Stop commands have been introduced to toggle mocking

### Known Bugs:

- Intellisense does not currently recognize composite keys or multiple keys
- Composition Errors sometimes don't point at the correct location in the document
- Intellisense type completion is currently missing from writing operations, to be added back in shortly
- ## Currently doesn't support opening workbench in a complex folder (i.e. a node project with a node_modules folder)

## Apollo Workbench VSCode 0.1.3

### Improvements:

- Cache csdl parsing - was taking a long time to load for large schemas

## Apollo Workbench VSCode 0.1.2

### Improvements:

- Add graphql-parser functions for reading available type/extension/scalar/enum/interface definitions when developing
- Added better location/type mapping

## Apollo Workbench VSCode 0.1.1

### Improvements:

- Hide `.workbench` folder and associated files into background
- Introduce _rename_ schema functionality
- Introduce _duplicate_ workbench file functionlity
- Simplify context/menu items
  - Removed all buttons from schema/operaitons for currently loaded workbench (with the exception of opening query plan)
  - Centralized options to right click context items
  - Moved destructive actions to a new group to add line separtation
- [MVP] - Added Completion Item provider for available type extensions from CSDL :tada:
  - Doesn't show extension options for what is defined in open service/schema file
    - Future improvement could be to provide these as options that just move the cursor to the given position
  - [BUG] Currently doesn't support composite keys
- [MVP] - Added preloaded workbench example file

## Apollo Workbench VSCode 0.1.0

Initial Beta Release

- Apollo Studio Integration
  - Enter user API key to load accounts - must currently select 1 account at a time
    - No "switch account" button, have to logout and log back in
  - Load graphs and variants for a given account
  - Load gql operations for a given graph
  - Create workbench file from a given graph and graphVariant
  - Create gql operation in current workbench from Studio operation
- Workbench
  - Mock schemas by running an AS instance for each schema defined in the workbench
    - Introduced `shouldMock` in the workbench file schemas for future support of pointing at prod/local urls to support scenarios like Kotlin GraphQL code first sdl
  - ApolloGateway extension where `loadServiceDefinitions` points at the workbench file to compose
  - Composition errors are logged to vscode.Diagnostics in Problems panel
  - Query plan generation using Rust wasm can be viewed for any opertion with a composed graph
