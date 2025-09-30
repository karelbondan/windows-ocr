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
const vision_1 = __importDefault(require("@google-cloud/vision"));
const child_process_1 = __importDefault(require("child_process"));
let mainWindow = { win: null, tray: null, icons: null };
let screenshotWindows = {};
let aboutWindow;
let usrConfig;
let fileName;
const trayIcon = electron_1.nativeImage.createFromPath(path_1.default.join(__dirname, "../../src/media/icon_tray.png")).resize({ width: 16, height: 16 });
const appIcon = electron_1.nativeImage.createFromPath(path_1.default.join(__dirname, "../../src/media/icon_color.png")).resize({ width: 50, height: 50 });
const googleClient = new vision_1.default.ImageAnnotatorClient();
// utils
function _getWindowsKeys() {
    return Object.keys(screenshotWindows);
}
function _focusWindow(keys) {
    for (const displayID of keys) {
        screenshotWindows[displayID].focus();
    }
}
function saveConfig(shortcut, ss, notepad) {
    const kb_shortcut = shortcut ? shortcut.trim() : "";
    fs_1.default.writeFileSync(path_1.default.join(process.cwd(), 'config.json'), JSON.stringify({
        keyboardShortcut: kb_shortcut,
        saveAsScreenshot: ss,
        openNotepad: notepad
    }));
}
function loadConfig() {
    return JSON.parse(fs_1.default.readFileSync(path_1.default.join(process.cwd(), 'config.json'), { encoding: 'utf8', flag: 'r' }));
}
try {
    usrConfig = loadConfig();
}
catch (error) {
    saveConfig("Control + Shift + Alt + T", false, false);
    usrConfig = loadConfig();
}
function createMainWindow() {
    mainWindow.win = new electron_1.BrowserWindow({
        width: 800, height: 600, minimizable: false, show: false,
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
            label: "Launch",
            click: (item, window, event) => {
                const windows = _getWindowsKeys();
                if (windows.length < 1) {
                    createScreenshotWindow();
                }
                else {
                    _focusWindow(windows);
                }
                // screenshotWindow.focus();
            }
        },
        {
            label: "Settings",
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
        const displays = electron_1.screen.getAllDisplays();
        const bounds = displays.map(display => display.bounds);
        // get max res of displays to output the best resolution.
        // desktopCapturer will adjust the width/height accordingly
        // if the value exceeds one of them. 
        const maxRes = bounds.reduce((max, curr) => {
            const currMax = Math.max(curr.height, curr.width);
            return Math.max(max, currMax);
        }, 0);
        yield electron_1.desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: maxRes, height: maxRes }
        }).then((sources) => __awaiter(this, void 0, void 0, function* () {
            for (const source of sources) {
                if (source) {
                    fs_1.default.writeFileSync(
                    // path.join(os.tmpdir(), 'WindowsOCR.png'),
                    path_1.default.join(os_1.default.tmpdir(), `ocr-temp-${source.display_id}.png`), source.thumbnail.toPNG());
                }
            }
        })).catch(e => console.log(e));
        for (const display of displays) {
            const displayID = String(display.id);
            let SSWindow = new electron_1.BrowserWindow({
                width: display.bounds.width, height: display.bounds.height, frame: false,
                show: false, transparent: true, x: display.bounds.x, y: display.bounds.y,
                webPreferences: {
                    contextIsolation: true,
                    nodeIntegration: true,
                    preload: path_1.default.join(__dirname, 'preload.js')
                },
                minimizable: false, resizable: false, icon: appIcon
            });
            SSWindow.setMenuBarVisibility(false);
            SSWindow.setIcon(appIcon);
            SSWindow.loadFile(path_1.default.join(__dirname, '../../src/site/index.html'));
            SSWindow.once('ready-to-show', () => {
                SSWindow.show();
            });
            SSWindow.webContents.on('did-finish-load', () => {
                SSWindow.webContents.send("ocr:loadimg", display.id);
            });
            SSWindow.on('close', () => {
                delete screenshotWindows[displayID];
            });
            setTimeout(() => {
                SSWindow.setFullScreen(true);
            }, 500);
            screenshotWindows[displayID] = SSWindow;
        }
    });
}
function createAboutWindow() {
    aboutWindow = new electron_1.BrowserWindow({
        width: 600, height: 450, show: false, center: true,
        maximizable: false, icon: appIcon, resizable: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: true,
            preload: path_1.default.join(__dirname, 'preload.js')
        },
    });
    aboutWindow.setMenuBarVisibility(false);
    aboutWindow.setIcon(appIcon);
    aboutWindow.loadFile(path_1.default.join(__dirname, '../../src/site/about.html'));
    aboutWindow.once('ready-to-show', () => {
        aboutWindow === null || aboutWindow === void 0 ? void 0 : aboutWindow.show();
    });
    aboutWindow.on('close', () => {
        aboutWindow = null;
    });
}
function createErrorDialog(title, body) {
    electron_1.dialog.showMessageBoxSync({
        type: "error",
        title: title,
        message: body
    });
    electron_1.app.exit(1);
}
function createWarningDialog(title, body) {
    electron_1.dialog.showMessageBoxSync({
        type: "warning",
        title: title,
        message: body
    });
}
function registerShortcut(config) {
    electron_1.globalShortcut.unregisterAll();
    let kbdTrigger;
    console.log(config.keyboardShortcut);
    if (config.keyboardShortcut !== "") {
        kbdTrigger = electron_1.globalShortcut.register(config.keyboardShortcut.replace(/\s/g, ''), () => {
            const windows = _getWindowsKeys();
            if (windows.length < 1) {
                console.log("OCR capture initiated");
                createScreenshotWindow();
            }
            else {
                console.log("OCR window already opened");
                _focusWindow(windows);
            }
        });
        if (!kbdTrigger) {
            console.log("Global shortcut registration failed");
            return { success: false, reason: "reg_failed" };
        }
        else {
            console.log("Global shortcut registration success");
            return { success: true, reason: "" };
        }
    }
    return { success: false, reason: "empty" };
}
electron_1.app.whenReady().then(() => __awaiter(void 0, void 0, void 0, function* () {
    if (fs_1.default.existsSync(path_1.default.join(process.cwd(), 'credentials.json')))
        process.env.GOOGLE_APPLICATION_CREDENTIALS = path_1.default.join(process.cwd(), 'credentials.json');
    else {
        createErrorDialog("Windows OCR", "Cannot find 'credentials.json' inside the application's directory. Please follow "
            + "the initial setup process at the GitHub repository if you have not already.");
    }
    electron_1.ipcMain.handle('ocr:perform', (event, message) => __awaiter(void 0, void 0, void 0, function* () {
        if (usrConfig.saveAsScreenshot) {
            const today = new Date();
            fileName = "Screenshot_"
                + today.toJSON().slice(0, 10).replace(/\-/g, '')
                + "_"
                + today.toString().split(' ')[4].replace(/\:/g, '')
                + ".png";
            fs_1.default.copyFileSync(path_1.default.join(os_1.default.tmpdir(), 'WindowsOCRCrop.png'), path_1.default.join(os_1.default.homedir(), 'Pictures', 'Screenshots', fileName));
        }
        return googleClient.documentTextDetection(path_1.default.join(os_1.default.tmpdir(), 'WindowsOCRCrop.png'));
        // return await new Promise(resolve => setTimeout(() => resolve('delay'), 3000));
    }));
    electron_1.ipcMain.handle('config:load', (event, message) => {
        return loadConfig();
    });
    electron_1.ipcMain.handle('config:save', (event, config) => {
        saveConfig(config.shortcut, config.ss, config.notepad);
        usrConfig = loadConfig();
        const regUpdateSuccess = registerShortcut(usrConfig);
        if (!regUpdateSuccess.reason && regUpdateSuccess.reason === "reg_failed") {
            createWarningDialog("Windows OCR", "Failed to register a global shortcut to launch the OCR window. "
                + "You can restart the app to re-apply the updated configuration.");
        }
        new electron_1.Notification({
            icon: appIcon,
            title: "Saved successfully",
            body: "Configuration was updated and changes have been implemented successfully."
        }).show();
        return true;
    });
    electron_1.ipcMain.on('window:close', (event, args) => {
        if (args.error === "") {
            // screenshotWindow?.close();
            Object.entries(screenshotWindows).map(([_, window]) => {
                window.close();
            });
            if (!args.escape) {
                if (usrConfig.openNotepad)
                    if (process.platform === 'win32')
                        child_process_1.default.spawn("C:\\Windows\\notepad.exe", [path_1.default.join(os_1.default.tmpdir(), 'WindowsOCRResult.txt')]);
                if (usrConfig.saveAsScreenshot) {
                    new electron_1.Notification({
                        icon: appIcon,
                        title: "Screenshot saved",
                        body: "Screenshot was saved in "
                            + os_1.default.homedir() + "\\Pictures\\Screenshots\\" + fileName
                    }).show();
                }
            }
        }
    });
    electron_1.ipcMain.on('window:error', (event, message) => {
        createErrorDialog("Windows OCR", message);
    });
    const shortcutRegSuccess = registerShortcut(usrConfig);
    if (process.platform === 'win32')
        electron_1.app.setAppUserModelId("Windows OCR");
    createMainWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createMainWindow();
    });
    if (!shortcutRegSuccess.success && shortcutRegSuccess.reason === "reg_failed") {
        createWarningDialog("Windows OCR", "Failed to register a global shortcut to launch the OCR window. "
            + "You can restart the app to re-apply the updated configuration.");
    }
    if (!shortcutRegSuccess.success) {
        new electron_1.Notification({
            icon: appIcon,
            title: "Minimised to tray",
            body: "App has been minimised to tray. You can launch the OCR window "
                + "by right clicking the app's icon on the tray"
        }).show();
    }
    else {
        new electron_1.Notification({
            icon: appIcon,
            title: "Minimised to tray",
            body: "App has been minimised to tray. Press "
                + usrConfig.keyboardShortcut.replace(/\s/g, '') + " to launch the OCR"
        }).show();
    }
}));
electron_1.app.on("before-quit", ev => {
    electron_1.globalShortcut.unregisterAll();
    mainWindow.win.removeAllListeners("close");
    mainWindow = null;
    screenshotWindows = {};
    aboutWindow = null;
    fs_1.default.unlinkSync(path_1.default.join(os_1.default.tmpdir(), 'WindowsOCR.png'));
    fs_1.default.unlinkSync(path_1.default.join(os_1.default.tmpdir(), 'WindowsOCRCrop.png'));
    fs_1.default.unlinkSync(path_1.default.join(os_1.default.tmpdir(), 'WindowsOCRResult.txt'));
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
