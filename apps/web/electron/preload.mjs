import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("eraOperator", {
  getConfig: () => ipcRenderer.invoke("operator:get-config"),
  saveConfig: (targetUrl) => ipcRenderer.invoke("operator:save-config", targetUrl)
});
