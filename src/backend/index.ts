import {
    app, BrowserWindow, ipcMain, screen, desktopCapturer, globalShortcut,
    Tray, Menu, nativeImage
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
        width: 800, height: 600, center: true, minimizable: false, show: false,
        webPreferences: {
            webSecurity: true,
            sandbox: true,
        },
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
            }
        },
        {
            label: "About",
            click: (item, window, event) => {
                if (!aboutWindow)
                    createAboutWindow();
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
                    path.join(os.tmpdir(), 'windowsocrtemp.png'),
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
        }
    });

    screenshotWindow.setMenuBarVisibility(false);
    screenshotWindow.setIcon(appIcon);
    screenshotWindow.loadFile(path.join(__dirname, '../../src/site/index.html'))
    screenshotWindow.once('ready-to-show', () => {
        screenshotWindow!.setPosition(0, 0);
        screenshotWindow!.show();
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
        width: 400, height: 300, show: false, center: true, resizable: false
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
    const kbdTrigger = globalShortcut.register(
        usrConfig.keyboardShortcut, () => {
            if (!screenshotWindow){
                console.log("ocr capture initiated");
                createScreenshotWindow();
            } else {
                console.log("ocr window already opened");
            }
        })

    if (!kbdTrigger)
        console.log("global shortcut registration failed");
    else 
        console.log("global shortcut registration success");

    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0)
            createMainWindow();
    })
})

app.setAboutPanelOptions({
    applicationName: "Windows OCR",
    applicationVersion: "Version 1.0.0",
    iconPath: trayIcon.resize({ width: 50, height: 50 }).toDataURL(),
    copyright: "Copyright © 2024 Karel Bondan",
    version: "Version 1.0.0"
})

app.on("before-quit", ev => {
    globalShortcut.unregisterAll()
    mainWindow!.win!.removeAllListeners("close");
    mainWindow = null;
    screenshotWindow = null;
    aboutWindow = null;
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        app.quit();
    fs.unlinkSync(path.join(os.tmpdir(), 'windowsocrtemp.png'))
})