import {
    app, BrowserWindow, ipcMain, screen, desktopCapturer, globalShortcut,
    Tray, Menu, nativeImage, Notification, dialog
} from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'

let mainWindow: {
    win: BrowserWindow | null,
    tray: Tray | null,
    icons: BrowserWindow | null
} | null = { win: null, tray: null, icons: null };
let screenshotWindow: BrowserWindow | null;
let aboutWindow: BrowserWindow | null;
const usrConfig = require('../../config.json');

const trayIcon = nativeImage.createFromPath(
    path.join(__dirname, "../../src/media/icon_tray.png")
).resize({ width: 16, height: 16 });
const appIcon = nativeImage.createFromPath(
    path.join(__dirname, "../../src/media/icon_color.png")
).resize({ width: 50, height: 50 });

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
        width: 400, height: 300, show: false, center: true, resizable: false,
        icon: appIcon
    })
    aboutWindow.setMenu(null)
    aboutWindow.setIcon(appIcon);
    aboutWindow.loadFile(path.join(__dirname, '../../src/site/about.html'))
    aboutWindow.once('ready-to-show', () => {
        aboutWindow?.show();
    })
    aboutWindow.on('close', () => {
        aboutWindow = null;
    })
}

app.whenReady().then(async () => {
    if (fs.existsSync(path.join(app.getAppPath(), 'credentials.json')))
        process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(app.getAppPath(), 'credentials.json');
    else {
        dialog.showMessageBoxSync({
            type: "error",
            title: "Windows OCR",
            message: "Cannot find 'credentials.json' inside the application's directory. Please follow the initial setup process at the GitHub repository if you have not already."
        })
        app.exit(1);
    }

    ipcMain.handle('ocr:perform', async (event, message) => {
        console.log(message);
        for (var i = 0; i <= 100; i++) { }
        console.log("handled successfully");
    })

    const kbdTrigger = globalShortcut.register(
        usrConfig.keyboardShortcut, () => {
            if (!screenshotWindow) {
                console.log("OCR capture initiated");
                createScreenshotWindow();
            } else {
                console.log("OCR window already opened");
                screenshotWindow.focus();
            }
        })

    if (!kbdTrigger)
        console.log("Global shortcut registration failed");
    else
        console.log("Global shortcut registration success");

    if (process.platform === 'win32')
        app.setAppUserModelId("Windows OCR");

    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0)
            createMainWindow();
    })

    new Notification({
        icon: appIcon,
        title: "Minimized to tray",
        body: `App has been minimized to tray. Press ${usrConfig.keyboardShortcut} to launch the OCR`
    }).show();
})

app.on("before-quit", ev => {
    globalShortcut.unregisterAll()
    mainWindow!.win!.removeAllListeners("close");
    mainWindow = null;
    screenshotWindow = null;
    aboutWindow = null;
    fs.unlinkSync(path.join(os.tmpdir(), 'WindowsOCR.png'))
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        app.quit();
})