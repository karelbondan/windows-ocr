import { ipcRenderer, contextBridge } from "electron";
import os from 'os'
import path from 'path'

export const versionsPreload = {
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron
}

export const ipcRendererPreload = {
    send: (channel: any, data: any) => ipcRenderer.send(channel, data),
    on: (channel: any, func: (...args: any) => {}) => ipcRenderer.on(channel, (event, ...args) => func(...args))
}

export const osPreload = {
    tmpdir: () => os.tmpdir()
}

export const pathPreload = {
    join: (...paths: any) => path.join(...paths)
}

contextBridge.exposeInMainWorld('versions', versionsPreload)
contextBridge.exposeInMainWorld('ipcRenderer', ipcRendererPreload)
contextBridge.exposeInMainWorld('os', osPreload)
contextBridge.exposeInMainWorld('path', pathPreload)