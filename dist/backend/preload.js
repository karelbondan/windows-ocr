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
    // The main process now sends a per-display payload (image path + display
    // metadata). The legacy zero-arg callback signature is gone; renderer must
    // read `imagePath` to load the correct screenshot for its display.
    loadImage: (callback) => electron_1.ipcRenderer.on('ocr:loadimg', (_event, value) => callback(value)),
    exportImageAndDoOCR: (img) => {
        const imgData = img.replace(/^data:image\/\w+;base64,/, '');
        const imgBuffer = Buffer.from(imgData, 'base64');
        fs_1.default.writeFileSync(path_1.default.join(os_1.default.tmpdir(), 'WindowsOCRCrop.png'), imgBuffer);
        return electron_1.ipcRenderer.invoke('ocr:perform', 'send-receive test');
    },
    // Notifies main that the user has started drawing on this overlay so the
    // overlays on other displays can be torn down.
    signalSelectionStarted: (displayId) => electron_1.ipcRenderer.send('overlay:selection-started', displayId),
    closeWindow: (error, escape) => electron_1.ipcRenderer.send('window:close', { error: error, escape: escape }),
    spawnError: (message) => electron_1.ipcRenderer.send('window:error', message),
    loadConfig: () => electron_1.ipcRenderer.invoke('config:load'),
    saveConfig: (shortcut, ss, notepad, showNotifications, notificationPreviewLength) => electron_1.ipcRenderer.invoke('config:save', {
        shortcut, ss, notepad,
        showNotifications, notificationPreviewLength,
    }),
};
electron_1.contextBridge.exposeInMainWorld('ocrRenderer', exports.ocrRenderer);
