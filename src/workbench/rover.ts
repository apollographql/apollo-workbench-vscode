import { buildSubgraphSchema } from '@apollo/subgraph';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { spawn } from 'child_process';
import { TextDecoder } from 'util';
import gql from 'graphql-tag';
import {
  Progress,
  Terminal,
  Uri,
  commands,
  env,
  window,
  workspace,
} from 'vscode';
import { Subgraph } from './file-system/ApolloConfig';
import { CompositionResults } from './file-system/CompositionResults';
import { StateManager } from './stateManager';
import { addMocksToSchema } from '@graphql-tools/mock';
import { FieldWithType } from './federationCompletionProvider';
import { GraphQLSchema, parse, StringValueNode, visit } from 'graphql';
import { log } from '../utils/logger';
import { FileProvider } from './file-system/fileProvider';
import { openSandboxWebview } from './webviews/sandbox';
import { statusBar } from '../extension';
import { resolvePath } from '../utils/uri';
import { normalizePath } from '../utils/path';
import { resolve } from 'path';
import { URI } from 'vscode-uri';

export class Rover {
  private static _instance: Rover;
  private wbFilePath: string = '';
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

  private async execute(command: string, json = true, shouldLog = true) {
    let cmd = json ? `${command} --format=json` : command;
    if (StateManager.settings_roverConfigProfile) {
      cmd = `${cmd} --profile=${StateManager.settings_roverConfigProfile}`;
    }

    if(StateManager.settings_apolloApiUrl) {
      cmd = `APOLLO_REGISTRY_URL=${StateManager.settings_apolloApiUrl} ${cmd}`;
    }

    if (process.platform !== 'win32') {
      //workaround, source rover binary from install location
      //MacOS will spawn a non-interactive non-login shell using bash (even if you use zsh for defaul)
      //  Since it is non-login, it won't read .bashrc, .bash_profile or .profile
      //  We shouldn't have to do this, but the user could be in a situation where rover isn't in the $PATH
      //    I'm not sure why this can happen, but it happened to me when I was messing around with NVM
      //  TODO: Make this a osx specific setting in VSCode, then test in Windows
      cmd = `source /$HOME/.rover/env && ${cmd}`;
    }
    if (shouldLog) this.logCommand(cmd);

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
    else if (result == '') {
      log('Rover is not installed');
      window
        .showErrorMessage(
          'You must install the Rover CLI to use this extension. After installing the Rover CLI, you will need to restart VS Code and accept the license.',
          'Install Rover',
        )
        .then((r) => {
          if (r == 'Install Rover') {
            env.openExternal(
              Uri.parse(
                'https://www.apollographql.com/docs/rover/getting-started',
              ),
            );
          }
        });
    }
    const compResults = JSON.parse(result) as CompositionResults;

    if (compResults.error && compResults.error.message.includes('ELv2')) {
      log('ELv2 for Rover needs to be accepted');
      const preloaded =
        await FileProvider.instance.getPreloadedWorkbenchFiles();
      const preloadedPath = normalizePath(preloaded[0].path);
      await window.showErrorMessage(
        'Certain Rover commands require you to accept the terms of the ELv2 licesnse. A terminal window will be opened for you to accept the ELv2 license. After accepting, you can close the terminal window and use this extension normally.',
        { modal: true },
      );

      const term = window.createTerminal('Rover ELv2 accept');
      term.sendText(`rover supergraph compose --config="${preloadedPath}"`);
      term.show();
    }

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
      if (!sdl) {
        log('Not authenticated. Must run rover config auth');
        window
          .showErrorMessage(
            'Fetching schemas from GraphOS requires you to authenticate the Rover CLI with your User API key. A terminal window will open for you to configure this.',
            { modal: true },
          )
          .then(() => {
            const term = window.createTerminal('rover config auth');
            term.sendText('rover config auth');
            term.show();
          });
        throw new Error('Rover is not configured');
      }
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
    let sdl = await this.execute(
      `rover subgraph introspect ${url}`,
      false,
      false,
    );
    if (!sdl ?? sdl == '') {
      sdl = await this.execute(`rover graph introspect ${url}`, false, false);
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
  // //For any subgraph being mocked, we will store a port mapping of subgraphName to port
  // portMapping: { [subgraphName: string]: number } = {};
  //subgraphState will hold the ApolloServer instances based on the ports they are running on
  private subgraphState: { [subgraphName: string]: ApolloServer } = {};
  ports: { [subgraphName: string]: number } = {};

  async restartMockedSubgraph(subgraphName: string, subgraph: Subgraph) {
    if (!this.primaryDevTerminal) return;

    log(`Restarting subgraph: ${subgraphName}`);

    log(`Stopping subgraph: ${subgraphName}`);
    this.stopMockedSubgraph(subgraphName);
    await this.startMockedSubgraph(subgraphName, subgraph);
  }

  async startMockedSubgraph(
    subgraphName: string,
    subgraph: Subgraph,
    port: number = this.ports[subgraphName] ?? 0,
  ) {
    try {
      const schemaPath =
        subgraph.schema.workbench_design ?? subgraph.schema.file ?? '';
      const schemaDesign = await workspace.fs.readFile(resolvePath(schemaPath));
      const schemaString = new TextDecoder().decode(schemaDesign);
      const typeDefs = gql(schemaString);
      //Dynamically create __resolveReference resolvers based on defined entites in Graph
      const mockedResolveReferences = {};
      const entities = Rover.extractDefinedEntities(schemaString);
      Object.keys(entities).forEach(
        (entity) =>
          (mockedResolveReferences[entity] = {
            __resolveReference(parent, args, context, info) {
              return { ...parent };
            },
          }),
      );
      let schema: GraphQLSchema | undefined;
      const customMocks = subgraph.schema.mocks?.customMocks
        ? await workspace.fs.readFile(
            Uri.parse(subgraph.schema.mocks?.customMocks),
          )
        : undefined;

      if (customMocks) {
        try {
          const console = {} as any;
          console.log = function (str: string) {
            log(`conslog.log - ${str}`);
          };
          const mocks = eval(customMocks.toString());
          if (mocks) {
            //If user defined custom resolvers
            if (mocks.resolvers) {
              //Delete __resolveReference that we created for mocks
              Object.keys(mocks.resolvers).forEach((type) => {
                if (
                  mocks.resolvers[type]?.__resolveReference &&
                  mockedResolveReferences[type].__resolveReference
                ) {
                  delete mockedResolveReferences[type].__resolveReference;

                  if (Object.values(mockedResolveReferences[type]).length == 0)
                    delete mockedResolveReferences[type];
                }
              });

              //If type is defined in custom resolvers,
              //We need to combine the resolvers and delete from mocks
              Object.keys(mockedResolveReferences).forEach((type) => {
                if (mocks.resolvers[type]) {
                  mocks.resolvers[type].__resolveReference =
                    mockedResolveReferences[type].__resolveReference;
                  delete mockedResolveReferences[type];
                }
              });

              schema = buildSubgraphSchema({
                typeDefs,
                resolvers: { ...mocks.resolvers, ...mockedResolveReferences },
              });
            }

            if (schema)
              schema = addMocksToSchema({
                schema,
                mocks: mocks?.mocks ? mocks.mocks : mocks,
                preserveResolvers: true,
              });
          }
        } catch (error: any) {
          log(`Unable to eval custom mocks. Did you export your mocks? Error:`);
          log(`\t${error?.message}`);
        }
      }

      const server = new ApolloServer({
        schema: schema
          ? schema
          : addMocksToSchema({
              schema: buildSubgraphSchema({
                typeDefs,
                resolvers: mockedResolveReferences,
              }),
              preserveResolvers: true,
            }),
      });

      const { url } = await startStandaloneServer(server, {
        listen: { port },
        context: async ({ req }) => ({ ...req.headers }),
      });

      log(`\t${subgraphName} mock server running at ${url}`);
      this.subgraphState[subgraphName] = server;

      if (port == 0) {
        port = Number.parseInt(new URL(url).port);
        this.ports[subgraphName] = port;
        // const wbFile = await FileProvider.instance.getTempWorkbenchFileAsync();
        // wbFile.subgraphs[subgraphName].routing_url = `http://localhost:${port}`;
        // await FileProvider.instance.updateTempWorkbenchFile(wbFile);
      }

      return url;
    } catch (err: any) {
      this.subgraphState[subgraphName]?.stop();
      delete this.subgraphState[subgraphName];

      log(err.message);
      console.log('unable to start mocked subgraph');
      return undefined;
    }
  }
  private stopMockedSubgraph(subgraphName: string) {
    if (this.subgraphState[subgraphName]) {
      this.subgraphState[subgraphName].stop();
      delete this.subgraphState[subgraphName];
    }
  }

  stopRoverDev() {
    if (Rover.instance.primaryDevTerminal) {
      Rover.instance.primaryDevTerminal.sendText('\u0003');
      Rover.instance.primaryDevTerminal.dispose();
    }

    Rover.instance.primaryDevTerminal = undefined;

    Object.keys(Rover.instance.subgraphState).forEach((subgraphName) =>
      Rover.instance.stopMockedSubgraph(subgraphName),
    );

    this.ports = {};
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
    if (
      !this.primaryDevTerminal &&
      Object.keys(this.subgraphState).length > 0
    ) {
      //  Terminal window has kill sig from user, old mock ports alive
      Object.keys(this.subgraphState).forEach((subgraphName) =>
        this.stopMockedSubgraph(subgraphName),
      );
    } else if (!this.primaryDevTerminal) {
      //  No terminal window created -  no running mocks - good to go
    } else if (this.primaryDevTerminal?.name != wbFilePath) {
      //  Terminal window running rover dev - new design
      statusBar.text = 'Switching Design';
      statusBar.show();
      this.stopRoverDev();
    } else if (wbFilePath == this.primaryDevTerminal?.name) {
      //  Terminal window running rover dev - same design
      statusBar.text = 'Refreshing Design';
      statusBar.show();
      this.stopRoverDev();
    } else {
      this.stopRoverDev();
    }

    this.wbFilePath = wbFilePath;
    const wbFile = FileProvider.instance.workbenchFileFromPath(wbFilePath);
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
        const subgraphUrl = await Rover.instance.startMockedSubgraph(
          subgraphName,
          subgraph,
        );

        if (subgraphUrl) {
          progress?.report({
            message: `Mocked subgraph ${subgraphName}`,
            increment,
          });
          wbFile.subgraphs[subgraphName].routing_url = subgraphUrl;
        }
      }
    }

    await FileProvider.instance.updateTempWorkbenchFile(wbFile);
    const config = FileProvider.instance.getTempWorkbenchFilePath();
    const configPath = StateManager.settings_routerConfigFile
      ? StateManager.settings_routerConfigFile
      : normalizePath(
          resolve(__dirname, '..', 'media', `preloaded-files`, 'router.yaml'),
        );
    let command = `rover dev --supergraph-config=${config} --supergraph-port=${StateManager.settings_routerPort} --router-config=${configPath}`;
    if (wbFile.federation_version) {
      //wbFile.federation_version should have '=' in it
      if (wbFile.federation_version.includes('='))
        command = `APOLLO_ROVER_DEV_COMPOSITION_VERSION${wbFile.federation_version} ${command}`;
      else {
        log(
          `You must have the federation_version formatted to '={major}.{minor}.{patch}' to specify the version of router to run with rover dev.`,
        );
        log(`Defaulting to latest version of composition.`);
      }
    }
    if (StateManager.settings_routerVersion) {
      command = `APOLLO_ROVER_DEV_ROUTER_VERSION=${StateManager.settings_routerVersion} ${command}`;
    }
    if (StateManager.settings_graphRef) {
      command = `APOLLO_GRAPH_REF=${StateManager.settings_graphRef} ${command}`;
    }
    if (StateManager.settings_roverConfigProfile) {
      command = `${command} --profile=${StateManager.settings_roverConfigProfile}`;
    }
    if(StateManager.settings_apolloApiUrl){
      command = `APOLLO_REGISTRY_URL=${StateManager.settings_apolloApiUrl} ${command}`;
    }
    this.primaryDevTerminal = window.createTerminal(wbFilePath);
    this.primaryDevTerminal.show();
    this.primaryDevTerminal.sendText(command);
    this.runningFilePath = wbFilePath;

    this.logCommand(command);

    await new Promise<void>((resolve) => setTimeout(resolve, 5000));
    progress?.report({
      message: 'Opening Sandbox',
    });
    await openSandboxWebview();
    statusBar.hide();
  }

  /**
   * If rover dev is already running, it will be restarted with the same config
   * If rover dev is not running, nothing will be changed.
   * We need to do this for adding or removing subgraphs from a config file because rover dev doesn't currently watch for those changes.
   * See https://github.com/apollographql/rover/issues/1885.
   */
  async tryRestartRoverDev(wbFilePath: string) {
    if (this.wbFilePath == wbFilePath && this.primaryDevTerminal) {
      this.stopRoverDev();
      await this.startRoverDev(this.wbFilePath);
    }
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
