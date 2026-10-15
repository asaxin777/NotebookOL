import { app, BrowserWindow, dialog } from "electron";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";

const serverRoot = path.join(process.resourcesPath, "noteisle");
const appServerRoot = serverRoot;
const serverScript = path.join(appServerRoot, "server.js");
const nodeExecutable = path.join(process.resourcesPath, "node.exe");
const dataDirectory = process.env.NOTEISLE_DATA_DIR
  ? path.resolve(process.env.NOTEISLE_DATA_DIR)
  : path.join(app.getPath("appData"), "NoteIsle");
const logPath = path.join(dataDirectory, "desktop.log");

let serverProcess;
let mainWindow;
let logStream;
let shuttingDown = false;
let serverUrl;

function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  logStream?.write(line);
  console.error(line.trimEnd());
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not determine an available local port."));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

function waitForServer(url, child) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("The local server did not start in time.")), 30_000);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    }

    child.once("error", (error) => finish(error));
    child.once("exit", (code, signal) => {
      finish(new Error(`The local server stopped before becoming ready (code ${code}, signal ${signal}).`));
    });

    async function probe() {
      if (settled) return;
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
        if (response.ok) {
          finish();
          return;
        }
      } catch {
        // The server is expected to refuse connections while it is starting.
      }
      if (!settled) setTimeout(probe, 250);
    }

    void probe();
  });
}

function startServer(port) {
  serverUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(nodeExecutable, [serverScript], {
    cwd: appServerRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      NODE_PATH: path.join(appServerRoot, "vendor"),
      NODE_ENV: "production",
      NOTEISLE_DB_PATH: path.join(dataDirectory, "noteisle.sqlite"),
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(port),
    },
  });

  serverProcess.stdout.on("data", (chunk) => log(chunk.toString().trimEnd()));
  serverProcess.stderr.on("data", (chunk) => log(chunk.toString().trimEnd()));
  serverProcess.on("exit", (code, signal) => {
    if (shuttingDown) return;
    log(`Local server exited (code ${code}, signal ${signal}).`);
    dialog.showErrorBox(
      "紙嶼服務已停止",
      `本機筆記服務意外停止。請查看記錄檔：\n${logPath}`,
    );
    app.quit();
  });

  return serverProcess;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin !== serverUrl) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  void mainWindow.loadURL(serverUrl).catch((error) => {
    log(`Could not open the local app: ${error.message}`);
    dialog.showErrorBox("無法開啟紙嶼", `本機頁面載入失敗。請查看記錄檔：\n${logPath}`);
    app.quit();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    try {
      mkdirSync(dataDirectory, { recursive: true });
      logStream = createWriteStream(logPath, { flags: "a" });
      const port = await getFreePort();
      const child = startServer(port);
      await waitForServer(`${serverUrl}/api/local-auth`, child);
      createMainWindow();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Startup failed: ${message}`);
      dialog.showErrorBox("紙嶼啟動失敗", `${message}\n\n記錄檔：${logPath}`);
      app.quit();
    }
  });

  app.on("before-quit", () => {
    shuttingDown = true;
    serverProcess?.kill();
    logStream?.end();
  });

  app.on("window-all-closed", () => app.quit());
}
