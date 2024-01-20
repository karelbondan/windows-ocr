"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ocrRenderer = void 0;
const electron_1 = require("electron");
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
exports.ocrRenderer = {
    loadImage: (callback) => electron_1.ipcRenderer.on('ocr:loadimg', (_event, value) => callback(value)),
    exportImageAndDoOCR: (img) => {
        const imgData = img.replace(/^data:image\/\w+;base64,/, '');
        const imgBuffer = Buffer.from(imgData, 'base64');
        fs_1.default.writeFileSync(path_1.default.join(os_1.default.tmpdir(), 'WindowsOCRCrop.png'), imgBuffer);
        return electron_1.ipcRenderer.invoke('ocr:perform', 'send-receive test');
    },
    tempImageLoc: () => path_1.default.join(os_1.default.tmpdir(), 'WindowsOCR.png'),
    closeWindow: (error, escape) => electron_1.ipcRenderer.send('window:close', { error: error, escape: escape }),
    spawnError: (message) => electron_1.ipcRenderer.send('window:error', message),
    loadConfig: () => electron_1.ipcRenderer.invoke('config:load'),
    saveConfig: (shortcut, ss, notepad) => electron_1.ipcRenderer.invoke('config:save', { shortcut: shortcut, ss: ss, notepad: notepad }),
    writeTextToFile: (content) => fs_1.default.writeFileSync(path_1.default.join(os_1.default.tmpdir(), 'WindowsOCRResult.txt'), content, { encoding: 'utf-8' })
};
electron_1.contextBridge.exposeInMainWorld('ocrRenderer', exports.ocrRenderer);
