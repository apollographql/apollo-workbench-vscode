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
