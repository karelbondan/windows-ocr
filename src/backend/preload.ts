import { ipcRenderer, contextBridge } from "electron";
import os from 'os';
import path from 'path';
import fs from 'fs';

export const ocrRenderer = {
    loadImage: (callback: (displayID: number) => {}) => ipcRenderer.on('ocr:loadimg', (_event, displayID) => callback(displayID)),
    exportImageAndDoOCR: (img: string) => {
        const imgData = img.replace(/^data:image\/\w+;base64,/, '');
        const imgBuffer = Buffer.from(imgData, 'base64');
        fs.writeFileSync(path.join(os.tmpdir(), 'WindowsOCRCrop.png'), imgBuffer);
        return ipcRenderer.invoke('ocr:perform', 'send-receive test');
    },
    tempImageLoc: (displayID: number) => path.join(os.tmpdir(), `ocr-temp-${displayID}.png`),
    closeWindow: (error: string, escape: boolean) => ipcRenderer.send('window:close', { error: error, escape: escape }),
    spawnError: (message: string) => ipcRenderer.send('window:error', message),
    loadConfig: () => ipcRenderer.invoke('config:load'),
    saveConfig: (shortcut: string, ss: boolean, notepad: boolean) => ipcRenderer.invoke('config:save', { shortcut: shortcut, ss: ss, notepad: notepad }),
    writeTextToFile: (content: string) => fs.writeFileSync(path.join(os.tmpdir(), 'WindowsOCRResult.txt'), content, { encoding: 'utf-8' })
}

contextBridge.exposeInMainWorld('ocrRenderer', ocrRenderer);