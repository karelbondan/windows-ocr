import {
    app, BrowserWindow, ipcMain, screen, desktopCapturer, globalShortcut,
    Tray, Menu, nativeImage, Notification, dialog
} from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import vision from '@google-cloud/vision';
import spawnObj from 'child_process'

let mainWindow: {
    win: BrowserWindow | null,
    tray: Tray | null,
    icons: BrowserWindow | null
} | null = { win: null, tray: null, icons: null };
let screenshotWindow: BrowserWindow | null;
let aboutWindow: BrowserWindow | null;
let usrConfig: userConfig
let fileName: string

const trayIcon = nativeImage.createFromPath(
    path.join(__dirname, "../../src/media/icon_tray.png")
).resize({ width: 16, height: 16 });
const appIcon = nativeImage.createFromPath(
    path.join(__dirname, "../../src/media/icon_color.png")
).resize({ width: 50, height: 50 });
const googleClient = new vision.ImageAnnotatorClient();

function saveConfig(shortcut: string, ss: boolean, notepad: boolean) {
    const kb_shortcut = shortcut ? shortcut.trim() : "";
    fs.writeFileSync(path.join(process.cwd(), 'config.json'), JSON.stringify({
        keyboardShortcut: kb_shortcut,
        saveAsScreenshot: ss,
        openNotepad: notepad
    }));
}

function loadConfig() {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config.json'),
        { encoding: 'utf8', flag: 'r' }));
}

try {
    usrConfig = loadConfig();
} catch (error) {
    saveConfig("Control + Shift + Alt + T", false, false);
    usrConfig = loadConfig();
}

function createMainWindow() {
    mainWindow!.win = new BrowserWindow({
        width: 800, height: 600, minimizable: false, show: false,
        webPreferences: {
            webSecurity: true,
            sandbox: true,
        },
        icon: appIcon
    })

    mainWindow!.tray = new Tray(trayIcon);
    const menu = Menu.buildFromTemplate([
        {
            label: "Windows OCR",
            icon: trayIcon,
            enabled: false,
        },
        { type: "separator" },
        {
            label: "Launch",
            click: (item, window, event) => {
                if (!screenshotWindow)
                    createScreenshotWindow();
                else
                    screenshotWindow.focus();
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
    ])
    mainWindow!.tray.setToolTip("Windows OCR");
    mainWindow!.tray.setContextMenu(menu);
}

async function createScreenshotWindow() {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.size;
    const factor = primaryDisplay.scaleFactor;

    await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
            width: width * factor, height: height * factor
        }
    }).then(async sources => {
        for (const source of sources) {
            if (source) {
                fs.writeFileSync(
                    path.join(os.tmpdir(), 'WindowsOCR.png'),
                    source.thumbnail.toPNG()
                );
                return
            }
        }
    }).catch(e => console.log(e))

    screenshotWindow = new BrowserWindow({
        width: 1, height: 1, frame: false, show: false, transparent: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: true,
            preload: path.join(__dirname, 'preload.js')
        },
        minimizable: false, resizable: false, icon: appIcon
    });

    screenshotWindow.setMenuBarVisibility(false);
    screenshotWindow.setIcon(appIcon);
    screenshotWindow.loadFile(path.join(__dirname, '../../src/site/index.html'))
    screenshotWindow.once('ready-to-show', () => {
        screenshotWindow!.setPosition(0, 0);
        screenshotWindow!.show();
    })
    screenshotWindow.webContents.on('did-finish-load', () => {
        screenshotWindow!.webContents.send("ocr:loadimg");
    })
    screenshotWindow.on('close', () => {
        screenshotWindow = null;
    })
    setTimeout(() => {
        screenshotWindow!.setFullScreen(true);
    }, 500);
}

function createAboutWindow() {
    aboutWindow = new BrowserWindow({
        width: 600, height: 450, show: false, center: true,
        maximizable: false, icon: appIcon, resizable: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: true,
            preload: path.join(__dirname, 'preload.js')
        },
    })
    aboutWindow.setMenuBarVisibility(false);
    aboutWindow.setIcon(appIcon);
    aboutWindow.loadFile(path.join(__dirname, '../../src/site/about.html'))
    aboutWindow.once('ready-to-show', () => {
        aboutWindow?.show();
    })
    aboutWindow.on('close', () => {
        aboutWindow = null;
    })
}

function createErrorDialog(title: string, body: string) {
    dialog.showMessageBoxSync({
        type: "error",
        title: title,
        message: body
    })
    app.exit(1);
}

function createWarningDialog(title: string, body: string) {
    dialog.showMessageBoxSync({
        type: "warning",
        title: title,
        message: body
    })
}

function registerShortcut(config: userConfig): { success: boolean, reason: string } {
    globalShortcut.unregisterAll();
    let kbdTrigger: boolean;

    console.log(config.keyboardShortcut);

    if (config.keyboardShortcut !== "") {
        kbdTrigger = globalShortcut.register(config.keyboardShortcut.replace(/\s/g, ''), () => {
            if (!screenshotWindow) {
                console.log("OCR capture initiated");
                createScreenshotWindow();
            } else {
                console.log("OCR window already opened");
                screenshotWindow.focus();
            }
        })

        if (!kbdTrigger) {
            console.log("Global shortcut registration failed");
            return { success: false, reason: "reg_failed" }
        } else {
            console.log("Global shortcut registration success");
            return { success: true, reason: "" }
        }
    }

    return { success: false, reason: "empty" }
}

app.whenReady().then(async () => {
    if (fs.existsSync(path.join(process.cwd(), 'credentials.json')))
        process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(process.cwd(), 'credentials.json');
    else {
        createErrorDialog(
            "Windows OCR",
            "Cannot find 'credentials.json' inside the application's directory. Please follow "
            + "the initial setup process at the GitHub repository if you have not already."
        )
    }

    ipcMain.handle('ocr:perform', async (event, message) => {
        if (usrConfig.saveAsScreenshot) {
            const today = new Date();
            fileName = "Screenshot_"
                + today.toJSON().slice(0, 10).replace(/\-/g, '')
                + "_"
                + today.toString().split(' ')[4].replace(/\:/g, '')
                + ".png";
            fs.copyFileSync(
                path.join(os.tmpdir(), 'WindowsOCRCrop.png'),
                path.join(os.homedir(), 'Pictures', 'Screenshots', fileName
                ));
        }
        return googleClient.documentTextDetection(path.join(os.tmpdir(), 'WindowsOCRCrop.png'));
        // return await new Promise(resolve => setTimeout(() => resolve('delay'), 3000));
    })

    ipcMain.handle('config:load', (event, message) => {
        return loadConfig();
    })

    ipcMain.handle('config:save', (event, config: {
        shortcut: string, ss: boolean, notepad: boolean
    }) => {
        saveConfig(config.shortcut, config.ss, config.notepad);

        usrConfig = loadConfig();

        const regUpdateSuccess = registerShortcut(usrConfig);
        if (!regUpdateSuccess.reason && regUpdateSuccess.reason === "reg_failed") {
            createWarningDialog(
                "Windows OCR",
                "Failed to register a global shortcut to launch the OCR window. "
                + "You can restart the app to re-apply the updated configuration."
            )
        }

        new Notification({
            icon: appIcon,
            title: "Saved successfully",
            body: "Configuration was updated and changes have been implemented successfully."
        }).show();
        return true;
    })

    ipcMain.on('window:close', (event, args: { error: string, escape: boolean }) => {
        if (args.error === "") {
            screenshotWindow?.close();
            if (!args.escape) {
                if (usrConfig.openNotepad)
                    if (process.platform === 'win32')
                        spawnObj.spawn("C:\\Windows\\notepad.exe",
                            [path.join(os.tmpdir(), 'WindowsOCRResult.txt')]);
                if (usrConfig.saveAsScreenshot) {
                    new Notification({
                        icon: appIcon,
                        title: "Screenshot saved",
                        body: "Screenshot was saved in "
                            + os.homedir() + "\\Pictures\\Screenshots\\" + fileName
                    }).show();
                }
            }
        }
    })

    ipcMain.on('window:error', (event, message) => {
        createErrorDialog(
            "Windows OCR",
            message
        )
    })

    const shortcutRegSuccess = registerShortcut(usrConfig);

    if (process.platform === 'win32')
        app.setAppUserModelId("Windows OCR");

    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0)
            createMainWindow();
    })

    if (!shortcutRegSuccess.success && shortcutRegSuccess.reason === "reg_failed") {
        createWarningDialog(
            "Windows OCR",
            "Failed to register a global shortcut to launch the OCR window. "
            + "You can restart the app to re-apply the updated configuration."
        )
    }

    if (!shortcutRegSuccess.success) {
        new Notification({
            icon: appIcon,
            title: "Minimised to tray",
            body: "App has been minimised to tray. You can launch the OCR window "
                + "by right clicking the app's icon on the tray"
        }).show();
    } else {
        new Notification({
            icon: appIcon,
            title: "Minimised to tray",
            body: "App has been minimised to tray. Press "
                + usrConfig.keyboardShortcut.replace(/\s/g, '') + " to launch the OCR"
        }).show();
    }
})

app.on("before-quit", ev => {
    globalShortcut.unregisterAll()
    mainWindow!.win!.removeAllListeners("close");
    mainWindow = null;
    screenshotWindow = null;
    aboutWindow = null;
    fs.unlinkSync(path.join(os.tmpdir(), 'WindowsOCR.png'))
    fs.unlinkSync(path.join(os.tmpdir(), 'WindowsOCRCrop.png'))
    fs.unlinkSync(path.join(os.tmpdir(), 'WindowsOCRResult.txt'))
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        app.quit();
})