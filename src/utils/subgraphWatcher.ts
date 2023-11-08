import { Uri, workspace } from 'vscode';
import { FileProvider } from '../workbench/file-system/fileProvider';
import { Rover } from '../workbench/rover';
import { log } from './logger';
import { StateManager } from '../workbench/stateManager';

export interface Watcher {
  wbFilePath: string;
  subgraphName: string;
  url: string;
}

export class SubgraphWatcher {
  private watchers: Array<Watcher> = [];

  private _isRunning = false;

  static instance = new SubgraphWatcher();

  refresh() {
    this.watchers = [];
    const wbFiles = FileProvider.instance.getWorkbenchFiles();
    wbFiles.forEach((wbFile, wbFilePath) => {
      Object.keys(wbFile.subgraphs).forEach((subgraphName) => {
        const subgraph = wbFile.subgraphs[subgraphName];
        if (subgraph.schema.subgraph_url != undefined) {
          this.watchers.push({
            wbFilePath,
            subgraphName,
            url: subgraph.schema.subgraph_url,
          });
        }
      });
    });

    this.start();
  }

  start() {
    if (this._isRunning) return;
    this._isRunning = true;
    this.watch();
  }
  stop() {
    this._isRunning = false;
  }

  private async watch() {
    while (this._isRunning && StateManager.settings_enableSubgraphUrlWatcher) {
      const loopStart = Date.now();
      for (let i = 0; i < this.watchers.length; i++) {
        const watcher = this.watchers[i];
        const didUpdate =
          await FileProvider.instance.updateTempSubgraphUrlSchema(
            watcher.wbFilePath,
            watcher.subgraphName,
            watcher.url,
          );

        if (didUpdate) {
          log(
            `Found update for ${watcher.subgraphName} running at ${watcher.url}`,
          );
          await FileProvider.instance.refreshWorkbenchFileComposition(
            watcher.wbFilePath,
          );
        }
      }
      const loopTimeElapsed = Date.now() - loopStart;
      if (loopTimeElapsed < StateManager.settings_subgraphWatcherPingInterval) {
        await sleep(
          StateManager.settings_subgraphWatcherPingInterval - loopTimeElapsed,
        );
      }
    }

    this._isRunning = false;
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
