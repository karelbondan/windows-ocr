import {
    app, BrowserWindow, ipcMain, screen, desktopCapturer, globalShortcut,
    Tray, Menu, nativeImage, Notification, dialog, clipboard
} from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import vision from '@google-cloud/vision';
import spawnObj from 'child_process'

// Single-instance enforcement. Without this, a second launch (double-click
// of the tray icon, a second shortcut, etc.) starts a duplicate process
// that fights the first one for the global hotkey registration, leaving
// the user with two trays and no working hotkey. The second process exits
// immediately via app.exit(0) (skips before-quit so it doesn't try to
// clean up state it never initialized); the existing process catches the
// 'second-instance' event and fires the OCR capture as if the user had
// pressed the hotkey — useful feedback when the user forgot it's in tray.
if (!app.requestSingleInstanceLock()) {
    app.exit(0);
}
app.on('second-instance', () => {
    createScreenshotWindow();
});

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

const CONFIG_DEFAULTS = {
    keyboardShortcut: "Control + Shift + Alt + T",
    saveAsScreenshot: false,
    openNotepad: false,
    showNotifications: true,
    notificationPreviewLength: 60,
};

function saveConfig(cfg: Partial<userConfig>) {
    // Merge over existing on-disk state so partial saves (older callers) don't
    // wipe newer fields.
    let existing: Partial<userConfig> = {};
    try { existing = loadConfig(); } catch { /* first run */ }
    const merged: userConfig = { ...CONFIG_DEFAULTS, ...existing, ...cfg };
    if (typeof merged.keyboardShortcut === "string") merged.keyboardShortcut = merged.keyboardShortcut.trim();
    fs.writeFileSync(path.join(process.cwd(), 'config.json'), JSON.stringify(merged, null, 2));
}

function loadConfig(): userConfig {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config.json'),
        { encoding: 'utf8', flag: 'r' }));
    // Migrate older configs missing new fields — fall back to defaults.
    return { ...CONFIG_DEFAULTS, ...raw };
}

try {
    usrConfig = loadConfig();
} catch (error) {
    saveConfig({});
    usrConfig = loadConfig();
}

// ---------- History ----------
// Circular buffer of the last N successful OCR captures. Persisted in
// `userData` (NOT cwd, unlike the legacy `config.json`) so it survives
// reinstalls cleanly and lives in the per-user writable area.
const HISTORY_MAX = 20;
type HistoryEntry = { text: string, timestamp: number, charCount: number, preview: string };
let history: HistoryEntry[] = [];

function historyFilePath(): string {
    return path.join(app.getPath('userData'), 'windows-ocr-history.json');
}

function loadHistory(): HistoryEntry[] {
    try {
        const raw = fs.readFileSync(historyFilePath(), { encoding: 'utf8' });
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.slice(0, HISTORY_MAX) : [];
    } catch {
        return [];
    }
}

function saveHistory() {
    try {
        fs.writeFileSync(historyFilePath(), JSON.stringify(history, null, 2));
    } catch (e) {
        console.error("[history] save failed:", e);
    }
}

function makePreview(text: string, len: number): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > len ? flat.slice(0, len) + '…' : flat;
}

function appendToHistory(text: string) {
    const previewLen = usrConfig.notificationPreviewLength || 60;
    history.unshift({
        text,
        timestamp: Date.now(),
        charCount: text.length,
        preview: makePreview(text, previewLen),
    });
    if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
    saveHistory();
    rebuildTrayMenu();
}

// ---------- OCR result handling ----------
// Single funnel for every successful Vision response. Owns the side effects
// (clipboard, file write, notification, notepad spawn, history) so they
// remain consistent whether triggered by the overlay flow or any future
// entry point (e.g. drag-and-drop a screenshot file).
function handleOCRResult(text: string): { ok: true, length: number, preview: string } {
    const cleaned = (text || "").trim();

    if (cleaned === "") {
        if (usrConfig.showNotifications) {
            new Notification({
                icon: appIcon,
                title: "Windows OCR",
                body: "No text detected in the selected area.",
            }).show();
        }
        return { ok: true, length: 0, preview: "" };
    }

    // 1) Clipboard — done in main (not renderer) so it doesn't depend on the
    //    overlay window being focused at the moment of the write.
    clipboard.writeText(cleaned);

    // 2) Persist for downstream tools that the user may have enabled.
    try {
        fs.writeFileSync(
            path.join(os.tmpdir(), 'WindowsOCRResult.txt'),
            cleaned,
            { encoding: 'utf-8' }
        );
    } catch (e) {
        console.error("[ocr] writing result txt failed:", e);
    }

    // 3) Optional toast with text preview (truncated, whitespace collapsed).
    const preview = makePreview(cleaned, usrConfig.notificationPreviewLength || 60);
    if (usrConfig.showNotifications) {
        // Notification failures (permission denied, focus assist on, etc.) are
        // intentionally swallowed — clipboard already succeeded, so the user
        // got what they came for.
        try {
            new Notification({
                icon: appIcon,
                title: "Text copied to clipboard",
                body: `${cleaned.length} chars • ${preview}`,
            }).show();
        } catch (e) {
            console.error("[ocr] notification failed:", e);
        }
    }

    // 4) Opt-in Notepad spawn (legacy behavior — kept for users who relied on it).
    if (usrConfig.openNotepad && process.platform === 'win32') {
        try {
            spawnObj.spawn("C:\\Windows\\notepad.exe",
                [path.join(os.tmpdir(), 'WindowsOCRResult.txt')]);
        } catch (e) {
            console.error("[ocr] notepad spawn failed:", e);
        }
    }

    // 5) History.
    appendToHistory(cleaned);

    return { ok: true, length: cleaned.length, preview };
}

function handleOCRError(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ocr] error:", msg);
    if (usrConfig.showNotifications) {
        try {
            new Notification({
                icon: appIcon,
                title: "OCR failed",
                body: msg.length > 200 ? msg.slice(0, 200) + '…' : msg,
            }).show();
        } catch { /* ignore */ }
    }
}

// ---------- Tray menu (lazy rebuild for history submenu) ----------
function rebuildTrayMenu() {
    if (!mainWindow?.tray) return;
    const historyItems: Electron.MenuItemConstructorOptions[] = history.length === 0
        ? [{ label: "(empty)", enabled: false }]
        : history.map((h, idx) => ({
            label: `${idx + 1}. ${h.preview}`,
            toolTip: `${h.charCount} chars • ${new Date(h.timestamp).toLocaleString()}`,
            click: () => {
                clipboard.writeText(h.text);
                if (usrConfig.showNotifications) {
                    try {
                        new Notification({
                            icon: appIcon,
                            title: "Re-copied from history",
                            body: `${h.charCount} chars • ${h.preview}`,
                        }).show();
                    } catch { /* ignore */ }
                }
            },
        }));

    const menu = Menu.buildFromTemplate([
        { label: "Windows OCR", icon: trayIcon, enabled: false },
        { type: "separator" },
        { label: "Launch", click: () => createScreenshotWindow() },
        { label: "Settings", click: () => { if (!aboutWindow) createAboutWindow(); else aboutWindow.focus(); } },
        { type: "separator" },
        { label: "History", submenu: historyItems },
        { type: "separator" },
        { role: "quit" },
    ]);
    mainWindow.tray.setContextMenu(menu);
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
    mainWindow!.tray.setToolTip("Windows OCR");
    // Initial menu (also rebuilt whenever history changes).
    rebuildTrayMenu();
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

    history = loadHistory();

    ipcMain.handle('ocr:perform', async (event, message) => {
        // Side effects (saveAsScreenshot, Vision call, clipboard, notification,
        // notepad, history) all owned here. The renderer just awaits a boolean
        // outcome and closes the overlay either way.
        try {
            if (usrConfig.saveAsScreenshot) {
                const today = new Date();
                fileName = "Screenshot_"
                    + today.toJSON().slice(0, 10).replace(/\-/g, '')
                    + "_"
                    + today.toString().split(' ')[4].replace(/\:/g, '')
                    + ".png";
                fs.copyFileSync(
                    path.join(os.tmpdir(), 'WindowsOCRCrop.png'),
                    path.join(os.homedir(), 'Pictures', 'Screenshots', fileName)
                );
                if (usrConfig.showNotifications) {
                    try {
                        new Notification({
                            icon: appIcon,
                            title: "Screenshot saved",
                            body: "Saved to " + os.homedir() + "\\Pictures\\Screenshots\\" + fileName,
                        }).show();
                    } catch { /* ignore */ }
                }
            }
            const result = await googleClient.documentTextDetection(
                path.join(os.tmpdir(), 'WindowsOCRCrop.png')
            );
            const text = (result?.[0] as any)?.fullTextAnnotation?.text ?? "";
            return handleOCRResult(text);
        } catch (err) {
            handleOCRError(err);
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    })

    ipcMain.handle('config:load', (event, message) => {
        return loadConfig();
    })

    ipcMain.handle('config:save', (event, config: {
        shortcut: string, ss: boolean, notepad: boolean,
        showNotifications?: boolean, notificationPreviewLength?: number
    }) => {
        // Try to register the new shortcut FIRST. Persisting to disk before
        // validation could trap users in a crash loop: a bad accelerator
        // would re-trigger the same failure on every startup.
        const candidateConfig: userConfig = {
            keyboardShortcut: config.shortcut,
            saveAsScreenshot: config.ss,
            openNotepad: config.notepad,
            showNotifications: config.showNotifications ?? usrConfig.showNotifications,
            notificationPreviewLength: config.notificationPreviewLength ?? usrConfig.notificationPreviewLength,
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

        saveConfig(candidateConfig);
        usrConfig = loadConfig();

        new Notification({
            icon: appIcon,
            title: "Saved successfully",
            body: "Configuration was updated and changes have been implemented successfully."
        }).show();
        return { success: true };
    })

    ipcMain.on('window:close', (event, args: { error: string, escape: boolean }) => {
        // Tear down every overlay unconditionally. Previously this was gated by
        // `args.error === ""`, which meant an OCR failure would leave the
        // overlay open. The success-side effects (clipboard, notification,
        // notepad, screenshot copy) all moved into `ocr:perform`, so this
        // handler is now just window lifecycle.
        closeAllOverlays();
        cleanupOverlayPngs();
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