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
// One overlay per physical display, keyed by Electron's numeric display.id.
// Created fresh on every hotkey trigger so hot-plugged monitors are picked up.
let overlayWindows: Map<number, BrowserWindow> = new Map();
let aboutWindow: BrowserWindow | null;
let usrConfig: userConfig
let fileName: string

const DEBUG_MULTIMON = process.env.DEBUG_MULTIMON === "1";
function mmlog(...args: unknown[]) {
    if (DEBUG_MULTIMON) console.log("[multimon]", ...args);
}

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
                createScreenshotWindow();
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

function overlayPngPath(displayId: number): string {
    return path.join(os.tmpdir(), `WindowsOCR_${displayId}.png`);
}

function closeAllOverlays() {
    mmlog("closing all overlays:", overlayWindows.size);
    // Snapshot and clear up-front so the 'closed' listener (which calls
    // overlayWindows.delete) can't race with this iteration.
    const wins = Array.from(overlayWindows.values());
    overlayWindows.clear();
    for (const win of wins) {
        if (!win.isDestroyed()) win.close();
    }
}

function cleanupOverlayPngs() {
    // Best-effort cleanup of per-display screenshots written to tmpdir. Stale
    // files would survive across runs otherwise and slowly accumulate.
    try {
        const tmp = os.tmpdir();
        for (const name of fs.readdirSync(tmp)) {
            if (/^WindowsOCR_\d+\.png$/.test(name)) {
                try { fs.unlinkSync(path.join(tmp, name)); } catch { /* ignore */ }
            }
        }
    } catch (e) {
        mmlog("cleanupOverlayPngs failed:", e);
    }
}

async function createScreenshotWindow() {
    // Re-trigger of the hotkey while overlays already exist: just focus and bail.
    if (overlayWindows.size > 0) {
        const first = overlayWindows.values().next().value;
        if (first && !first.isDestroyed()) first.focus();
        return;
    }

    // Always re-enumerate displays — handles hot-plug without any cache.
    const displays = screen.getAllDisplays();
    mmlog("displays:", displays.map(d => ({
        id: d.id, bounds: d.bounds, size: d.size,
        scaleFactor: d.scaleFactor, rotation: d.rotation
    })));

    // `desktopCapturer.getSources` returns one source per physical display.
    // thumbnailSize is the *upper bound* applied to every source; we set it to
    // the largest physical resolution so no display is downscaled. Smaller
    // displays come back at their own native size (Electron preserves aspect).
    const maxPhysW = Math.max(...displays.map(d => Math.round(d.size.width * d.scaleFactor)));
    const maxPhysH = Math.max(...displays.map(d => Math.round(d.size.height * d.scaleFactor)));

    let sources: Electron.DesktopCapturerSource[] = [];
    try {
        sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: maxPhysW, height: maxPhysH }
        });
    } catch (e) {
        console.error("[multimon] desktopCapturer.getSources failed:", e);
        return;
    }
    mmlog("sources:", sources.map(s => ({ id: s.id, display_id: s.display_id, name: s.name })));

    // Match sources to displays by display_id. Electron returns display_id as a
    // string; display.id is numeric. When display_id is empty (older Electron
    // or some Linux setups), fall back to positional matching.
    const displayPngPaths = new Map<number, string>();
    displays.forEach((display, idx) => {
        let source = sources.find(s => s.display_id && s.display_id === display.id.toString());
        if (!source) source = sources[idx];
        if (!source) {
            mmlog("no source available for display", display.id);
            return;
        }
        const filePath = overlayPngPath(display.id);
        fs.writeFileSync(filePath, source.thumbnail.toPNG());
        displayPngPaths.set(display.id, filePath);
        mmlog("wrote", filePath, "for display", display.id);
    });

    // One overlay BrowserWindow per display, anchored to the display's bounds.
    //
    // Why NOT setFullScreen(true): on Windows, fullscreen on a secondary display
    // is unreliable and sometimes snaps the window back to the primary. Explicit
    // bounds + setAlwaysOnTop('screen-saver') gives the same UX deterministically
    // across all monitors (including those with negative x/y, i.e. to the left
    // of the primary, and rotated portrait monitors).
    for (const display of displays) {
        const imgPath = displayPngPaths.get(display.id);
        if (!imgPath) continue;

        const win = new BrowserWindow({
            x: display.bounds.x,
            y: display.bounds.y,
            width: display.bounds.width,
            height: display.bounds.height,
            frame: false, show: false, transparent: true,
            resizable: false, movable: false, minimizable: false, hasShadow: false,
            skipTaskbar: true,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: true,
                preload: path.join(__dirname, 'preload.js')
            },
            icon: appIcon
        });

        win.setMenuBarVisibility(false);
        win.setIcon(appIcon);
        // 'screen-saver' is the highest stacking level; keeps the overlay above
        // taskbars and other always-on-top apps.
        win.setAlwaysOnTop(true, 'screen-saver');
        win.loadFile(path.join(__dirname, '../../src/site/index.html'));

        win.webContents.on('did-finish-load', () => {
            // Per-display payload: each overlay loads its OWN physical screenshot,
            // which keeps the existing `normalise = naturalWidth / clientWidth`
            // math in screenshot.ts correct for that display's scaleFactor.
            win.webContents.send('ocr:loadimg', {
                imagePath: imgPath,
                displayId: display.id,
                bounds: display.bounds,
                scaleFactor: display.scaleFactor
            });
        });

        win.once('ready-to-show', () => {
            win.show();
        });

        win.on('closed', () => {
            overlayWindows.delete(display.id);
            mmlog("overlay closed for display", display.id, "remaining:", overlayWindows.size);
        });

        overlayWindows.set(display.id, win);
    }

    mmlog("created", overlayWindows.size, "overlay(s)");
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

// Electron accelerator modifiers (case-insensitive). See:
// https://www.electronjs.org/docs/latest/api/accelerator
const ACCELERATOR_MODIFIERS = new Set([
    'command', 'cmd', 'control', 'ctrl', 'commandorcontrol', 'cmdorctrl',
    'alt', 'option', 'altgr', 'shift', 'super', 'meta'
]);

function normalizeAccelerator(raw: string): string {
    return raw ? raw.replace(/\s/g, '') : '';
}

// Quick structural validation before handing the string to Electron.
// Prevents `globalShortcut.register` from throwing on malformed input
// (the throw inside an IPC handler is what froze the renderer on save).
function isValidAccelerator(acc: string): boolean {
    if (!acc) return false;
    const parts = acc.split('+').map(p => p.trim());
    if (parts.some(p => p.length === 0)) return false;
    if (parts.length < 2) return false;
    const nonModifiers = parts.filter(p => !ACCELERATOR_MODIFIERS.has(p.toLowerCase()));
    return nonModifiers.length === 1;
}

type ShortcutResult =
    | { success: true, reason: "" }
    | { success: false, reason: "empty" | "invalid" | "conflict" | "reg_failed" | "exception", error?: string };

function triggerCapture() {
    if (overlayWindows.size === 0) {
        console.log("OCR capture initiated");
        createScreenshotWindow();
    } else {
        console.log("OCR window already opened");
        // Re-focus the first overlay so the user can keep selecting.
        const first = overlayWindows.values().next().value;
        if (first && !first.isDestroyed()) first.focus();
    }
}

function registerShortcut(config: userConfig): ShortcutResult {
    // Always clear any previous binding first — registering the same accelerator
    // twice without unregistering is a no-op on some platforms and an error on
    // others, and was contributing to inconsistent state across save attempts.
    globalShortcut.unregisterAll();

    const accelerator = normalizeAccelerator(config.keyboardShortcut);

    if (accelerator === "") {
        return { success: false, reason: "empty" };
    }

    if (!isValidAccelerator(accelerator)) {
        console.log(`Global shortcut '${accelerator}' has invalid format`);
        return { success: false, reason: "invalid", error: `'${accelerator}' is not a valid accelerator` };
    }

    // Detect conflict with another running app so we can surface a friendly
    // message instead of a silent failure.
    if (globalShortcut.isRegistered(accelerator)) {
        console.log(`Global shortcut '${accelerator}' is already in use by another app`);
        return { success: false, reason: "conflict", error: `'${accelerator}' is already in use by another app` };
    }

    // `register` can throw synchronously on malformed accelerators that pass
    // our pre-check (Electron internals). Wrapping in try/catch keeps the IPC
    // handler responsive — without it the renderer's `invoke` never resolves
    // and the settings window appears frozen.
    try {
        const ok = globalShortcut.register(accelerator, triggerCapture);
        if (!ok) {
            console.log("Global shortcut registration failed");
            return { success: false, reason: "reg_failed", error: "Failed to register the shortcut" };
        }
        console.log(`Global shortcut '${accelerator}' registered`);
        return { success: true, reason: "" };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Hotkey] register threw:", msg);
        return { success: false, reason: "exception", error: msg };
    }
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
        // Try to register the new shortcut FIRST. Persisting to disk before
        // validation could trap users in a crash loop: a bad accelerator
        // would re-trigger the same failure on every startup.
        const candidateConfig: userConfig = {
            keyboardShortcut: config.shortcut,
            saveAsScreenshot: config.ss,
            openNotepad: config.notepad
        };
        const regResult = registerShortcut(candidateConfig);

        // "empty" is acceptable: the user explicitly cleared the shortcut and
        // the app falls back to tray-only operation.
        if (!regResult.success && regResult.reason !== "empty") {
            // Re-apply the previously working shortcut so the user is not left
            // with no binding at all after a failed update.
            registerShortcut(usrConfig);
            return { success: false, error: regResult.error ?? "Failed to update shortcut", reason: regResult.reason };
        }

        saveConfig(config.shortcut, config.ss, config.notepad);
        usrConfig = loadConfig();

        new Notification({
            icon: appIcon,
            title: "Saved successfully",
            body: "Configuration was updated and changes have been implemented successfully."
        }).show();
        return { success: true };
    })

    ipcMain.on('window:close', (event, args: { error: string, escape: boolean }) => {
        if (args.error === "") {
            // Tear down every overlay, not just the one that sent the event. By
            // the time this fires the user has either finished or cancelled, so
            // the other displays' overlays (if any survived selection-started)
            // must go too.
            closeAllOverlays();
            cleanupOverlayPngs();
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

    ipcMain.on('overlay:selection-started', (event, displayId: number) => {
        // User has begun dragging on `displayId`. Tear down overlays on the
        // OTHER displays so they stop intercepting input and stop dimming
        // those screens. The active overlay stays open until selection
        // completes (or ESC cancels via `window:close`).
        mmlog("selection started on display", displayId);
        for (const [id, win] of overlayWindows) {
            if (id !== displayId && !win.isDestroyed()) {
                win.close();
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

    if (!shortcutRegSuccess.success && shortcutRegSuccess.reason !== "empty") {
        createWarningDialog(
            "Windows OCR",
            "Failed to register a global shortcut to launch the OCR window. "
            + (shortcutRegSuccess.error ? `Reason: ${shortcutRegSuccess.error}. ` : "")
            + "You can change it in Settings or restart the app."
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
    closeAllOverlays();
    aboutWindow = null;
    // Best-effort temp cleanup. The original unlinkSync() calls threw if any
    // file was already missing (e.g. user quit before ever capturing) and that
    // exception aborted the rest of the cleanup.
    const tmpFiles = [
        path.join(os.tmpdir(), 'WindowsOCRCrop.png'),
        path.join(os.tmpdir(), 'WindowsOCRResult.txt'),
    ];
    for (const f of tmpFiles) {
        try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    cleanupOverlayPngs();
});

// Safety net for shutdown paths that don't fire `before-quit` (e.g. taskbar
// kill, OS logout) — without this an accelerator could remain registered with
// the OS after the app exits.
app.on("will-quit", () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        app.quit();
})