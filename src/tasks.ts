// Fleet CLI commands as native VS Code tasks: cancellable, visible in
// "Run Task", customisable from tasks.json, saved-before-run by VS Code.

import * as vscode from "vscode";

import { findStudies, fleetCommand, standardsOf } from "./study.ts";

interface FleetTaskDefinition extends vscode.TaskDefinition {
  type: "fleet";
  command: string;
  args?: string[];
  cwd?: string;
}

const STANDARD_TASKS: [string, string[]][] = [
  ["check", []],
  ["doctor", []],
  ["run", []],
  ["validate", []],
];

export class FleetTaskProvider implements vscode.TaskProvider {
  async provideTasks(): Promise<vscode.Task[]> {
    const tasks: vscode.Task[] = [];
    for (const study of await findStudies()) {
      const entries = [
        ...STANDARD_TASKS,
        ...standardsOf(study).map((standard): [string, string[]] => [
          "define-xml",
          ["--standard", standard.id],
        ]),
      ];
      for (const [command, args] of entries) tasks.push(fleetTask(study.root, command, args));
    }
    return tasks;
  }

  resolveTask(task: vscode.Task): vscode.Task {
    return build(task.definition as FleetTaskDefinition, task.scope ?? vscode.TaskScope.Workspace);
  }
}

export function fleetTask(cwd: vscode.Uri, command: string, args: string[] = []): vscode.Task {
  return build(
    { type: "fleet", command, args, cwd: cwd.fsPath },
    vscode.workspace.getWorkspaceFolder(cwd) ?? vscode.TaskScope.Workspace,
  );
}

/** Run a Fleet command and resolve with its exit code once the process ends. */
export async function runFleet(
  cwd: vscode.Uri,
  command: string,
  args: string[] = [],
): Promise<number | undefined> {
  const execution = await vscode.tasks.executeTask(fleetTask(cwd, command, args));
  return new Promise((resolve) => {
    const listeners = [
      vscode.tasks.onDidEndTaskProcess((event) => {
        if (event.execution === execution) finish(event.exitCode);
      }),
      // Fires even when the process never launched, so the caller is not left waiting.
      vscode.tasks.onDidEndTask((event) => {
        if (event.execution === execution) finish(undefined);
      }),
    ];
    function finish(code: number | undefined) {
      for (const listener of listeners) listener.dispose();
      resolve(code);
    }
  });
}

function build(
  definition: FleetTaskDefinition,
  scope: vscode.WorkspaceFolder | vscode.TaskScope,
): vscode.Task {
  const cwd = definition.cwd ?? (typeof scope === "object" ? scope.uri.fsPath : undefined);
  const root = cwd
    ? vscode.Uri.file(cwd)
    : (vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file("."));
  const argv = [definition.command, ...(definition.args ?? [])];
  const command = fleetCommand(root, argv);
  const task = new vscode.Task(
    definition,
    scope,
    argv.join(" "),
    "fleet",
    new vscode.ProcessExecution(command.command, command.args, { cwd: root.fsPath }),
  );
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Shared,
    clear: true,
    showReuseMessage: false,
  };
  return task;
}
