import { app, BrowserWindow, Menu, ipcMain } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configFileName = "operator-config.json";
const defaultTargetUrl = process.env.ERA_OPERATOR_TARGET_URL ?? "http://127.0.0.1:8080/overview";

let mainWindow = null;
let launcherWindow = null;

function operatorConfigPath() {
  return path.join(app.getPath("userData"), configFileName);
}

async function readOperatorConfig() {
  try {
    const raw = await fs.readFile(operatorConfigPath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return { targetUrl: defaultTargetUrl };
  }
}

async function writeOperatorConfig(targetUrl) {
  await fs.writeFile(operatorConfigPath(), JSON.stringify({ targetUrl }, null, 2), "utf8");
}

function createLauncherWindow() {
  launcherWindow = new BrowserWindow({
    width: 520,
    height: 460,
    resizable: false,
    title: "Connect Enterprise Resilience Agent",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true
    }
  });

  launcherWindow.on("closed", () => {
    launcherWindow = null;
  });

  void launcherWindow.loadFile(path.join(__dirname, "launcher.html"));
}

function createMainWindow(targetUrl) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    title: "Enterprise Resilience Agent",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(targetUrl);
}

function buildMenu() {
  const template = [
    {
      label: "Operator",
      submenu: [
        {
          label: "Change Connection",
          click: () => {
            if (launcherWindow) {
              launcherWindow.focus();
              return;
            }
            createLauncherWindow();
          }
        },
        {
          label: "Reload Dashboard",
          click: () => {
            mainWindow?.reload();
          }
        },
        { type: "separator" },
        { role: "quit" }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle("operator:get-config", async () => readOperatorConfig());
ipcMain.handle("operator:save-config", async (_event, targetUrl) => {
  await writeOperatorConfig(targetUrl);

  if (mainWindow) {
    await mainWindow.loadURL(targetUrl);
  } else {
    createMainWindow(targetUrl);
  }

  launcherWindow?.close();
  return { ok: true };
});

app.whenReady().then(async () => {
  buildMenu();
  const config = await readOperatorConfig();

  if (process.env.ERA_OPERATOR_SKIP_LAUNCHER === "true") {
    createMainWindow(config.targetUrl ?? defaultTargetUrl);
    return;
  }

  createMainWindow(config.targetUrl ?? defaultTargetUrl);
  createLauncherWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (!mainWindow) {
    const config = await readOperatorConfig();
    createMainWindow(config.targetUrl ?? defaultTargetUrl);
  }
});
