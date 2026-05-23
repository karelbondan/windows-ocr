import { ipcRenderer, contextBridge } from "electron";
import os from 'os';
import path from 'path';
import fs from 'fs';

type LoadImagePayload = {
    imagePath: string,
    displayId: number,
    bounds: { x: number, y: number, width: number, height: number },
    scaleFactor: number
};

export const ocrRenderer = {
    // The main process now sends a per-display payload (image path + display
    // metadata). The legacy zero-arg callback signature is gone; renderer must
    // read `imagePath` to load the correct screenshot for its display.
    loadImage: (callback: (val: LoadImagePayload) => void) =>
        ipcRenderer.on('ocr:loadimg', (_event, value: LoadImagePayload) => callback(value)),
    exportImageAndDoOCR: (img: string) => {
        const imgData = img.replace(/^data:image\/\w+;base64,/, '');
        const imgBuffer = Buffer.from(imgData, 'base64');
        fs.writeFileSync(path.join(os.tmpdir(), 'WindowsOCRCrop.png'), imgBuffer);
        return ipcRenderer.invoke('ocr:perform', 'send-receive test');
    },
    // Notifies main that the user has started drawing on this overlay so the
    // overlays on other displays can be torn down.
    signalSelectionStarted: (displayId: number) =>
        ipcRenderer.send('overlay:selection-started', displayId),
    closeWindow: (error: string, escape: boolean) => ipcRenderer.send('window:close', { error: error, escape: escape }),
    spawnError: (message: string) => ipcRenderer.send('window:error', message),
    loadConfig: () => ipcRenderer.invoke('config:load'),
    saveConfig: (shortcut: string, ss: boolean, notepad: boolean) => ipcRenderer.invoke('config:save', { shortcut: shortcut, ss: ss, notepad: notepad }),
    writeTextToFile: (content: string) => fs.writeFileSync(path.join(os.tmpdir(), 'WindowsOCRResult.txt'), content, { encoding: 'utf-8' })
}

contextBridge.exposeInMainWorld('ocrRenderer', ocrRenderer);