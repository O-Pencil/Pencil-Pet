import { contextBridge, ipcRenderer } from "electron";

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const api = {
  getSnapshot: () => ipcRenderer.invoke("get-snapshot"),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSettings: (settings: unknown) => ipcRenderer.send("set-settings", settings),
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const subscription = (_event: unknown, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  send: (channel: string, ...args: unknown[]) => ipcRenderer.send(channel, ...args),
  getAssetDataUrl: (filename: string) => ipcRenderer.invoke("get-asset-data-url", filename)
};

contextBridge.exposeInMainWorld("pencilPet", api);

// Type declaration for renderer
export type PencilPetApi = typeof api;
