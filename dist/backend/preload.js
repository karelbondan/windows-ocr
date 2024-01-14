"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pathPreload = exports.osPreload = exports.ipcRendererPreload = exports.versionsPreload = void 0;
const electron_1 = require("electron");
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
exports.versionsPreload = {
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron
};
exports.ipcRendererPreload = {
    send: (channel, data) => electron_1.ipcRenderer.send(channel, data),
    on: (channel, func) => electron_1.ipcRenderer.on(channel, (event, ...args) => func(...args))
};
exports.osPreload = {
    tmpdir: () => os_1.default.tmpdir()
};
exports.pathPreload = {
    join: (...paths) => path_1.default.join(...paths)
};
electron_1.contextBridge.exposeInMainWorld('versions', exports.versionsPreload);
electron_1.contextBridge.exposeInMainWorld('ipcRenderer', exports.ipcRendererPreload);
electron_1.contextBridge.exposeInMainWorld('os', exports.osPreload);
electron_1.contextBridge.exposeInMainWorld('path', exports.pathPreload);
