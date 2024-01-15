"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
let mainWindow = { win: null, tray: null, icons: null };
let screenshotWindow;
let aboutWindow;
const usrConfig = require('../../config.json');
const trayIcon = electron_1.nativeImage.createFromPath(path_1.default.join(__dirname, "../../src/media/icon_tray.png")).resize({ width: 16, height: 16 });
const appIcon = electron_1.nativeImage.createFromPath(path_1.default.join(__dirname, "../../src/media/icon_color.png")).resize({ width: 50, height: 50 });
function createMainWindow() {
    mainWindow.win = new electron_1.BrowserWindow({
        width: 800, height: 600, center: true, minimizable: false, show: false,
        webPreferences: {
            webSecurity: true,
            sandbox: true,
        },
        icon: appIcon
    });
    mainWindow.tray = new electron_1.Tray(trayIcon);
    const menu = electron_1.Menu.buildFromTemplate([
        {
            label: "Windows OCR",
            icon: trayIcon,
            enabled: false,
        },
        { type: "separator" },
        {
            label: "Launch OCR",
            click: (item, window, event) => {
                if (!screenshotWindow)
                    createScreenshotWindow();
                else
                    screenshotWindow.focus();
            }
        },
        {
            label: "About",
            click: (item, window, event) => {
                if (!aboutWindow)
                    createAboutWindow();
                else
                    aboutWindow.focus();
            }
        },
        { type: "separator" },
        { role: "quit" }
    ]);
    mainWindow.tray.setToolTip("Windows OCR");
    mainWindow.tray.setContextMenu(menu);
}
function createScreenshotWindow() {
    return __awaiter(this, void 0, void 0, function* () {
        const primaryDisplay = electron_1.screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.size;
        const factor = primaryDisplay.scaleFactor;
        yield electron_1.desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: {
                width: width * factor, height: height * factor
            }
        }).then((sources) => __awaiter(this, void 0, void 0, function* () {
            for (const source of sources) {
                if (source) {
                    fs_1.default.writeFileSync(path_1.default.join(os_1.default.tmpdir(), 'WindowsOCR.png'), source.thumbnail.toPNG());
                    return;
                }
            }
        })).catch(e => console.log(e));
        screenshotWindow = new electron_1.BrowserWindow({
            width: 1, height: 1, frame: false, show: false, transparent: true,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: true,
                preload: path_1.default.join(__dirname, 'preload.js')
            },
            minimizable: false, resizable: false, icon: appIcon
        });
        screenshotWindow.setMenuBarVisibility(false);
        screenshotWindow.setIcon(appIcon);
        screenshotWindow.loadFile(path_1.default.join(__dirname, '../../src/site/index.html'));
        screenshotWindow.once('ready-to-show', () => {
            screenshotWindow.setPosition(0, 0);
            screenshotWindow.show();
        });
        screenshotWindow.on('close', () => {
            screenshotWindow = null;
        });
        setTimeout(() => {
            screenshotWindow.setFullScreen(true);
        }, 500);
    });
}
function createAboutWindow() {
    aboutWindow = new electron_1.BrowserWindow({
        width: 400, height: 300, show: false, center: true, resizable: false,
        icon: appIcon
    });
    aboutWindow.setMenu(null);
    aboutWindow.setIcon(appIcon);
    aboutWindow.loadFile(path_1.default.join(__dirname, '../../src/site/about.html'));
    aboutWindow.once('ready-to-show', () => {
        aboutWindow === null || aboutWindow === void 0 ? void 0 : aboutWindow.show();
    });
    aboutWindow.on('close', () => {
        aboutWindow = null;
    });
}
electron_1.app.whenReady().then(() => __awaiter(void 0, void 0, void 0, function* () {
    const kbdTrigger = electron_1.globalShortcut.register(usrConfig.keyboardShortcut, () => {
        if (!screenshotWindow) {
            console.log("OCR capture initiated");
            createScreenshotWindow();
        }
        else {
            console.log("OCR window already opened");
            screenshotWindow.focus();
        }
    });
    if (!kbdTrigger)
        console.log("Global shortcut registration failed");
    else
        console.log("Global shortcut registration success");
    if (process.platform === 'win32')
        electron_1.app.setAppUserModelId("Windows OCR");
    createMainWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createMainWindow();
    });
    new electron_1.Notification({
        icon: appIcon,
        title: "Minimized to tray",
        body: `App has been minimized to tray. Press ${usrConfig.keyboardShortcut} to launch the OCR`
    }).show();
}));
electron_1.app.setAboutPanelOptions({
    applicationName: "Windows OCR",
    applicationVersion: "Version 1.0.0",
    iconPath: trayIcon.resize({ width: 50, height: 50 }).toDataURL(),
    copyright: "Copyright © 2024 Karel Bondan",
    version: "Version 1.0.0"
});
electron_1.app.on("before-quit", ev => {
    electron_1.globalShortcut.unregisterAll();
    mainWindow.win.removeAllListeners("close");
    mainWindow = null;
    screenshotWindow = null;
    aboutWindow = null;
    fs_1.default.unlinkSync(path_1.default.join(os_1.default.tmpdir(), 'WindowsOCR.png'));
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
