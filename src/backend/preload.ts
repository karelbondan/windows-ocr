import { ipcRenderer, contextBridge } from "electron";
import os from 'os';
import path from 'path';
import fs from 'fs';

export const ocrRenderer = {
    loadImage: (callback: (val: any) => {}) => ipcRenderer.on('ocr:loadimg', (_event, value) => callback(value)),
    exportImageAndDoOCR: (img: string) => {
        const imgData = img.replace(/^data:image\/\w+;base64,/, '');
        const imgBuffer = Buffer.from(imgData, 'base64');
        fs.writeFileSync(path.join(os.tmpdir(), 'WindowsOCRCrop.png'), imgBuffer);
        return ipcRenderer.invoke('ocr:perform', 'send-receive test');
    },
    tempImageLoc: () => path.join(os.tmpdir(), 'WindowsOCR.png'),
    closeWindow: () => ipcRenderer.send('window:close')
}

contextBridge.exposeInMainWorld('ocrRenderer', ocrRenderer);