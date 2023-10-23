import { buildSubgraphSchema } from '@apollo/subgraph';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { spawn } from 'child_process';
import { TextDecoder } from 'util';
import gql from 'graphql-tag';
import { Progress, Terminal, Uri, window, workspace } from 'vscode';
import { Subgraph } from './file-system/ApolloConfig';
import { CompositionResults } from './file-system/CompositionResults';
import { StateManager } from './stateManager';
import { addMocksToSchema } from '@graphql-tools/mock';
import { FieldWithType } from './federationCompletionProvider';
import { parse, StringValueNode, visit } from 'graphql';
import { log } from '../utils/logger';
import { FileProvider } from './file-system/fileProvider';
import { openSandboxWebview } from './webviews/sandbox';
import { statusBar } from '../extension';

export class Rover {
  private static _instance: Rover;
  static get instance(): Rover {
    if (!this._instance) this._instance = new Rover();

    return this._instance;
  }

  logCommand(command: string) {
    if (command.includes('APOLLO_KEY')) {
      const split = command.split(' ');
      split.shift();
      command = split.join(' ');
    }
    log(`Rover Execution: ${command}`);
  }

  runningFilePath: string | undefined;
  primaryDevTerminal: Terminal | undefined;

  private async execute(command: string, json = true) {
    let cmd = json ? `${command} --format=json` : command;
    if (StateManager.settings_roverConfigProfile) {
      cmd = `${cmd} --profile=${StateManager.settings_roverConfigProfile}`;
    } else if (StateManager.instance.globalState_userApiKey) {
      cmd = `APOLLO_KEY=${StateManager.instance.globalState_userApiKey} ${cmd}`;
    }

    this.logCommand(cmd);

    if (process.platform !== 'win32') {
      //workaround, source rover binary from install location
      //MacOS will spawn a non-interactive non-login shell using bash (even if you use zsh for defaul)
      //  Since it is non-login, it won't read .bashrc, .bash_profile or .profile
      //  We shouldn't have to do this, but the user could be in a situation where rover isn't in the $PATH
      //    I'm not sure why this can happen, but it happened to me when I was messing around with NVM
      //  TODO: Make this a osx specific setting in VSCode, then test in Windows
      cmd = `source /$HOME/.rover/env && ${cmd}`;
    }

    return await new Promise<string | undefined>((resolve, reject) => {
      try {
        let output = '';
        let error = '';
        const child = spawn(cmd, { shell: true });
        child.stdout.on('data', (data) => {
          output += data;
        });
        child.stderr.on('data', (data) => {
          error += data;
        });
        child.on('error', (err) => {
          if (error != '') log(error);

          resolve(output);
        });
        child.on('close', () => {
          if (error != '') log(error);

          resolve(output);
        });
      } catch (e) {
        log(JSON.stringify(e));
        resolve(undefined);
      }
    });
  }

  async compose(pathToConfig: string) {
    const command = `rover supergraph compose --config="${pathToConfig}"`;
    const result = await this.execute(command, true);

    if (result == undefined)
      return {
        data: { success: false },
        error: { message: 'Rover command failed' },
      } as CompositionResults;

    const compResults = JSON.parse(result) as CompositionResults;

    return compResults;
  }

  async checkSchema(input: {
    graphRef: string;
    subgraphName: string;
    schemaPath: string;
  }) {
    const command = `rover subgraph check ${input.graphRef} --schema=${input.schemaPath} --name=${input.subgraphName}`;

    const result = await this.execute(command);

    if (result == undefined)
      return {
        reportUrl: '',
        compResults: {
          data: { success: false },
          error: { message: 'Rover command failed' },
        },
        error: {
          code: '',
          message: 'Rover command failed',
          details: {
            build_errors: [],
          },
        },
      };

    const compResults = JSON.parse(result) as CompositionResults;
    const reportUrl =
      ((compResults.data as any)?.tasks?.operations?.target_url as string) ??
      '';

    return { ...compResults, reportUrl };
  }

  async writeSupergraphSDL(pathToConfig: string, pathToSaveTo: string) {
    await this.execute(
      `rover supergraph compose --config=${pathToConfig} > ${pathToSaveTo}`,
    );
  }

  async subgraphFetch(subgraph: Subgraph) {
    let sdl = '';
    if (subgraph.schema.graphref && subgraph.schema.subgraph) {
      sdl = await this.subgraphGraphOSFetch(
        subgraph.schema.graphref,
        subgraph.schema.subgraph,
      );
    } else {
      sdl = await this.subgraphIntrospect(
        subgraph.schema.subgraph_url ?? subgraph.routing_url ?? '',
      );
    }

    return sdl;
  }

  async subgraphGraphOSFetch(graphRef: string, subgraph: string) {
    const command = `rover subgraph fetch ${graphRef} --name=${subgraph}`;
    const result = await this.execute(command, false);

    return result ? result : '';
  }
  async subgraphIntrospect(url: string) {
    let sdl = await this.execute(`rover subgraph introspect ${url}`, false);
    if (!sdl ?? sdl == '') {
      sdl = await this.execute(`rover graph introspect ${url}`, false);
    }
    return sdl ? sdl : '';
  }

  async getProfiles(): Promise<string[]> {
    const results = await this.execute(`rover config list`, true);
    if (!results) return [];

    const data = JSON.parse(results).data;
    if (data.success) {
      return data.profiles;
    } else return [];
  }
  //For any subgraph being mocked, we will store a port mapping of subgraphName to port
  portMapping: { [subgraphName: string]: number } = {};
  //subgraphState will hold the ApolloServer instances based on the ports they are running on
  private subgraphState: { [port: number]: ApolloServer } = {};
  ports: number[] = [];

  private getNextAvailablePort() {
    let port = StateManager.settings_startingServerPort;
    while (this.subgraphState[port]) port++;

    return port;
  }

  async restartMockedSubgraph(subgraphName: string, subgraph: Subgraph) {
    if (!this.primaryDevTerminal) return;

    let port = 0;
    for (const sn in this.portMapping)
      if (sn == subgraphName) port = this.portMapping[sn];

    if (port != 0) {
      this.stopSubgraphOnPort(port);
      await this.startMockedSubgraph(subgraphName, subgraph, port);
    }
  }

  async startMockedSubgraph(
    subgraphName: string,
    subgraph: Subgraph,
    port?: number,
  ) {
    if (!port)
      port = this.portMapping[subgraphName] ?? this.getNextAvailablePort();

    try {
      const schemaPath =
        subgraph.schema.workbench_design ?? subgraph.schema.file ?? '';
      const schemaDesign = await workspace.fs.readFile(Uri.parse(schemaPath));
      const schemaString = new TextDecoder().decode(schemaDesign);
      const typeDefs = gql(schemaString);
      //Dynamically create __resolveReference resolvers based on defined entites in Graph
      const resolvers = {};
      const entities = Rover.extractDefinedEntities(schemaString);
      Object.keys(entities).forEach(
        (entity) =>
          (resolvers[entity] = {
            __resolveReference(parent, args) {
              return { ...parent };
            },
          }),
      );
      let schema = buildSubgraphSchema({ typeDefs, resolvers });
      const customMocks = subgraph.schema.mocks?.customMocks
        ? await workspace.fs.readFile(
            Uri.parse(subgraph.schema.mocks?.customMocks),
          )
        : undefined;

      if (customMocks) {
        try {
          const mocks = eval(customMocks.toString());
          if (mocks) {
            schema = addMocksToSchema({
              schema,
              mocks,
              preserveResolvers: true,
            });
          }
        } catch (error) {
          log(`Unable to eval custom mocks. Did you export your mocks?`);
        }
      } else schema = addMocksToSchema({ schema, preserveResolvers: true });

      const server = new ApolloServer({
        schema, //: addMocksToSchema({ schema, preserveResolvers: true }),
      });

      //Set the port and server to local state
      this.subgraphState[port] = server;
      this.portMapping[subgraphName] = port;

      startStandaloneServer(server, {
        listen: { port },
      });
    } catch (err) {
      this.subgraphState[port].stop();
      delete this.subgraphState[port];

      console.log('unable to start mocked subgraph');
    }
  }
  private stopSubgraphOnPort(port: number) {
    let subgraphName = '';
    for (const sn in this.portMapping)
      if (this.portMapping[sn] == port) subgraphName = sn;

    this.subgraphState[port].stop();
    delete this.subgraphState[port];

    if (this.portMapping[subgraphName]) delete this.portMapping[subgraphName];
  }

  stopRoverDev() {
    if (Rover.instance.primaryDevTerminal) {
      Rover.instance.primaryDevTerminal.sendText('\x03');
      Rover.instance.primaryDevTerminal.dispose();
    }

    Rover.instance.primaryDevTerminal = undefined;

    for (const port in Rover.instance.subgraphState) {
      Rover.instance.stopSubgraphOnPort(Number.parseInt(port));
    }
    Rover.instance.portMapping = {};
  }

  async startRoverDev(
    wbFilePath: string,
    progress?: Progress<{
      message?: string | undefined;
      increment?: number | undefined;
    }>,
    totalIncrement?: number,
  ) {
    //States of rover dev
    //  No terminal window created - starting for first time
    //  Terminal window running rover dev - same design
    //  Terminal window running rover dev - new design
    //  Terminal window has kill sig from user
    //  Terminal window killed by user
    //
    //  Since we don't have hooks for terminal events from the user, we
    //  must ensure all mocks are stopped and rover dev is restarted.
    //  Otherwise mocked ports can be kept alive and provide a very
    //  confusing experience
    if (!this.primaryDevTerminal && Object.keys(this.portMapping).length > 0) {
      //  Terminal window has kill sig from user, old mock ports alive
      Object.values(this.portMapping).forEach((port) =>
        this.stopSubgraphOnPort(port),
      );
    } else if (!this.primaryDevTerminal) {
      //  No terminal window created -  no running mocks - good ot go
    } else if (this.primaryDevTerminal?.name != wbFilePath) {
      //  Terminal window running rover dev - new design
      // window.showInformationMessage(
      //   'Currently running another design, switching to new design...',
      // );
      statusBar.text = 'Switching Design';
      statusBar.show();

      await this.stopRoverDev();
    } else if (wbFilePath == this.primaryDevTerminal?.name) {
      //  Terminal window running rover dev - same design
      // window.showInformationMessage(
      //   'Design is already running. Refreshing terminal and mocks...',
      // );

      statusBar.text = 'Refreshing Design';
      statusBar.show();
      await this.stopRoverDev();
    } else {
      await this.stopRoverDev();
    }

    const wbFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);
    const tempConfigPath = await FileProvider.instance.updateTempWorkbenchFile(
      wbFile,
    );

    const subgraphNames = Object.keys(wbFile.subgraphs);
    const subgraphsToMock: { [name: string]: Subgraph } = {};
    subgraphNames.forEach((s) => {
      if (wbFile.subgraphs[s].schema.mocks?.enabled)
        subgraphsToMock[s] = wbFile.subgraphs[s];
    });
    const subgraphNamesToMock = Object.keys(subgraphsToMock);
    const numberOfSubgraphsToMock = subgraphNamesToMock.length;

    //Mock any subgraphs we need to
    if (numberOfSubgraphsToMock > 0) {
      progress?.report({
        message: `${numberOfSubgraphsToMock} Subgraphs to mock`,
      });
      const increment = totalIncrement
        ? totalIncrement / (numberOfSubgraphsToMock + subgraphNames.length)
        : 100 / (numberOfSubgraphsToMock + subgraphNames.length);
      for (let i = 0; i < numberOfSubgraphsToMock; i++) {
        const subgraphName = subgraphNamesToMock[i];
        const subgraph = subgraphsToMock[subgraphName];
        await Rover.instance.startMockedSubgraph(subgraphName, subgraph);

        progress?.report({
          message: `Mocked subgraph ${subgraphName}`,
          increment,
        });
      }
    }

    const command = `rover dev --supergraph-config=${tempConfigPath} --supergraph-port=${StateManager.settings_routerPort}`;
    this.primaryDevTerminal = window.createTerminal(wbFilePath);
    this.primaryDevTerminal.show();
    this.primaryDevTerminal.sendText(command);
    this.runningFilePath = wbFilePath;

    await new Promise<void>((resolve) => setTimeout(resolve, 5000));
    progress?.report({
      message: 'Opening Sandbox',
    });
    await openSandboxWebview();
    statusBar.hide();
  }

  static extractDefinedEntities(schema: string) {
    const entities: {
      [entity: string]: FieldWithType[];
    } = {};

    try {
      visit(parse(schema), {
        ObjectTypeDefinition(node) {
          const keyDirective = node.directives?.find(
            (d) => d.name.value == 'key',
          );
          if (keyDirective) {
            const keyBlock = (
              keyDirective.arguments?.find((a) => a.name.value == 'fields')
                ?.value as StringValueNode
            )?.value;
            const parsedFields: string[] = [];
            let startIndex = -1;
            let notComposite = true;
            for (let i = 0; i < keyBlock.length; i++) {
              let lastParsedField = '';
              const char = keyBlock[i];
              switch (char) {
                case ' ':
                  if (startIndex != -1 && notComposite) {
                    lastParsedField = keyBlock.substring(startIndex, i);
                    parsedFields.push(lastParsedField);
                  }

                  startIndex = -1;
                  break;
                case '{':
                  notComposite = false;
                  break;
                case '}':
                  notComposite = true;
                  break;
                default:
                  if (startIndex == 0 && i == keyBlock.length - 1)
                    parsedFields.push(keyBlock);
                  else if (i == keyBlock.length - 1)
                    parsedFields.push(keyBlock.substring(startIndex));
                  else if (startIndex == -1) startIndex = i;
                  break;
              }
            }
            entities[node.name.value] = [];

            parsedFields.forEach((parsedField) => {
              const finalKey = keyBlock.trim();
              const field = node.fields?.find(
                (f) => f.name.value == parsedField,
              );
              let fieldType = '';
              if (field) fieldType = Rover.getFieldTypeString(field);

              entities[node.name.value].push({
                field: parsedField,
                type: fieldType,
              });
            });
          }
        },
        InterfaceTypeDefinition(node) {
          const keyDirective = node.directives?.find(
            (d) => d.name.value == 'key',
          );
          if (keyDirective) {
            const keyBlock = (
              keyDirective.arguments?.find((a) => a.name.value == 'fields')
                ?.value as StringValueNode
            )?.value;
            const parsedFields: string[] = [];
            let startIndex = -1;
            let notComposite = true;
            for (let i = 0; i < keyBlock.length; i++) {
              let lastParsedField = '';
              const char = keyBlock[i];
              switch (char) {
                case ' ':
                  if (startIndex != -1 && notComposite) {
                    lastParsedField = keyBlock.substring(startIndex, i);
                    parsedFields.push(lastParsedField);
                  }

                  startIndex = -1;
                  break;
                case '{':
                  notComposite = false;
                  break;
                case '}':
                  notComposite = true;
                  break;
                default:
                  if (startIndex == 0 && i == keyBlock.length - 1)
                    parsedFields.push(keyBlock);
                  else if (i == keyBlock.length - 1)
                    parsedFields.push(keyBlock.substring(startIndex));
                  else if (startIndex == -1) startIndex = i;
                  break;
              }
            }
            entities[node.name.value] = [];

            parsedFields.forEach((parsedField) => {
              const finalKey = keyBlock.trim();
              const field = node.fields?.find(
                (f) => f.name.value == parsedField,
              );
              let fieldType = '';
              if (field) fieldType = Rover.getFieldTypeString(field);

              entities[node.name.value].push({
                field: parsedField,
                type: fieldType,
              });
            });
          }
        },
      });
    } catch (err: any) {
      console.log(err);
    }

    return entities;
  }
  private static getFieldTypeString(field): string {
    switch (field.kind) {
      case 'FieldDefinition':
        return this.getFieldTypeString(field.type);
      case 'ListType':
        return `[${this.getFieldTypeString(field.type)}]`;
      case 'NamedType':
        return field.name.value;
      //Need to add the ! for NonNull
      case 'NonNullType':
        switch (field.type.kind) {
          case 'ListType':
            return `${this.getFieldTypeString(field.type)}!`;
          case 'NamedType':
            return `${field.type.name.value}!`;
        }
        return '';
      default:
        return '';
    }
  }
}
