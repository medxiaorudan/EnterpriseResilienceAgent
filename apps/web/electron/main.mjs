import { app, BrowserWindow, Menu, dialog, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configFileName = "operator-config.json";
const defaultTargetUrl = process.env.ERA_OPERATOR_TARGET_URL ?? "http://127.0.0.1:8080/overview";
const updateFeedUrl = process.env.ERA_OPERATOR_AUTO_UPDATE_URL;

let mainWindow = null;
let launcherWindow = null;
let showManualUpdateResult = false;
let autoUpdatesConfigured = false;

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

async function showInfo(title, message) {
  const targetWindow = mainWindow ?? launcherWindow ?? undefined;
  await dialog.showMessageBox(targetWindow, {
    type: "info",
    title,
    message
  });
}

async function checkForUpdates(manual = false) {
  if (!autoUpdatesConfigured) {
    if (manual) {
      await showInfo(
        "Updates not configured",
        "Update checks are available in packaged builds of the operator app."
      );
    }

    return;
  }

  showManualUpdateResult = manual;
  await autoUpdater.checkForUpdates();
}

function configureAutoUpdates() {
  if (!app.isPackaged) {
    return;
  }

  if (updateFeedUrl) {
    autoUpdater.setFeedURL({
      provider: "generic",
      url: updateFeedUrl
    });
  }

  autoUpdatesConfigured = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", async (event) => {
    if (!showManualUpdateResult) {
      return;
    }

    showManualUpdateResult = false;
    await showInfo("Update available", `A newer operator app version is available: ${event.version}.`);
  });

  autoUpdater.on("update-not-available", async () => {
    if (!showManualUpdateResult) {
      return;
    }

    showManualUpdateResult = false;
    await showInfo("Up to date", "This operator app is already on the latest published version.");
  });

  autoUpdater.on("update-downloaded", async (event) => {
    const targetWindow = mainWindow ?? launcherWindow ?? undefined;
    const result = await dialog.showMessageBox(targetWindow, {
      type: "info",
      buttons: ["Install now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: `Version ${event.version} is ready to install.`,
      detail: "The app can restart now to finish the update."
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on("error", async (error) => {
    console.error("Operator auto-update failed", error);

    if (!showManualUpdateResult) {
      return;
    }

    showManualUpdateResult = false;
    await showInfo("Update check failed", error instanceof Error ? error.message : "Unknown update error.");
  });
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
        {
          label: "Check for Updates",
          click: () => {
            void checkForUpdates(true);
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
  configureAutoUpdates();
  buildMenu();
  const config = await readOperatorConfig();

  if (process.env.ERA_OPERATOR_SKIP_LAUNCHER === "true") {
    createMainWindow(config.targetUrl ?? defaultTargetUrl);
  } else {
    createMainWindow(config.targetUrl ?? defaultTargetUrl);
    createLauncherWindow();
  }

  if (updateFeedUrl) {
    setTimeout(() => {
      void checkForUpdates(false);
    }, 8000);
  }
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
