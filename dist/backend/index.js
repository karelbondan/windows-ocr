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
// Single-instance enforcement. Without this, a second launch (double-click
// of the tray icon, a second shortcut, etc.) starts a duplicate process
// that fights the first one for the global hotkey registration, leaving
// the user with two trays and no working hotkey. The second process exits
// immediately via app.exit(0) (skips before-quit so it doesn't try to
// clean up state it never initialized); the existing process catches the
// 'second-instance' event and fires the OCR capture as if the user had
// pressed the hotkey — useful feedback when the user forgot it's in tray.
if (!electron_1.app.requestSingleInstanceLock()) {
    electron_1.app.exit(0);
}
electron_1.app.on('second-instance', () => {
    createScreenshotWindow();
});
let mainWindow = { win: null, tray: null, icons: null };
// One overlay per physical display, keyed by Electron's numeric display.id.
// Created fresh on every hotkey trigger so hot-plugged monitors are picked up.
let overlayWindows = new Map();
let aboutWindow;
let usrConfig;
let fileName;
const DEBUG_MULTIMON = process.env.DEBUG_MULTIMON === "1";
function mmlog(...args) {
    if (DEBUG_MULTIMON)
        console.log("[multimon]", ...args);
}
const trayIcon = electron_1.nativeImage.createFromPath(path_1.default.join(__dirname, "../../src/media/icon_tray.png")).resize({ width: 16, height: 16 });
const appIcon = electron_1.nativeImage.createFromPath(path_1.default.join(__dirname, "../../src/media/icon_color.png")).resize({ width: 50, height: 50 });
const googleClient = new vision_1.default.ImageAnnotatorClient();
const CONFIG_DEFAULTS = {
    keyboardShortcut: "Control + Shift + Alt + T",
    saveAsScreenshot: false,
    openNotepad: false,
    showNotifications: true,
    notificationPreviewLength: 60,
};
function saveConfig(cfg) {
    // Merge over existing on-disk state so partial saves (older callers) don't
    // wipe newer fields.
    let existing = {};
    try {
        existing = loadConfig();
    }
    catch ( /* first run */_a) { /* first run */ }
    const merged = Object.assign(Object.assign(Object.assign({}, CONFIG_DEFAULTS), existing), cfg);
    if (typeof merged.keyboardShortcut === "string")
        merged.keyboardShortcut = merged.keyboardShortcut.trim();
    fs_1.default.writeFileSync(path_1.default.join(process.cwd(), 'config.json'), JSON.stringify(merged, null, 2));
}
function loadConfig() {
    const raw = JSON.parse(fs_1.default.readFileSync(path_1.default.join(process.cwd(), 'config.json'), { encoding: 'utf8', flag: 'r' }));
    // Migrate older configs missing new fields — fall back to defaults.
    return Object.assign(Object.assign({}, CONFIG_DEFAULTS), raw);
}
try {
    usrConfig = loadConfig();
}
catch (error) {
    saveConfig({});
    usrConfig = loadConfig();
}
// ---------- History ----------
// Circular buffer of the last N successful OCR captures. Persisted in
// `userData` (NOT cwd, unlike the legacy `config.json`) so it survives
// reinstalls cleanly and lives in the per-user writable area.
const HISTORY_MAX = 20;
let history = [];
function historyFilePath() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'windows-ocr-history.json');
}
function loadHistory() {
    try {
        const raw = fs_1.default.readFileSync(historyFilePath(), { encoding: 'utf8' });
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.slice(0, HISTORY_MAX) : [];
    }
    catch (_a) {
        return [];
    }
}
function saveHistory() {
    try {
        fs_1.default.writeFileSync(historyFilePath(), JSON.stringify(history, null, 2));
    }
    catch (e) {
        console.error("[history] save failed:", e);
    }
}
function makePreview(text, len) {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > len ? flat.slice(0, len) + '…' : flat;
}
function appendToHistory(text) {
    const previewLen = usrConfig.notificationPreviewLength || 60;
    history.unshift({
        text,
        timestamp: Date.now(),
        charCount: text.length,
        preview: makePreview(text, previewLen),
    });
    if (history.length > HISTORY_MAX)
        history.length = HISTORY_MAX;
    saveHistory();
    rebuildTrayMenu();
}
// ---------- OCR result handling ----------
// Single funnel for every successful Vision response. Owns the side effects
// (clipboard, file write, notification, notepad spawn, history) so they
// remain consistent whether triggered by the overlay flow or any future
// entry point (e.g. drag-and-drop a screenshot file).
function handleOCRResult(text) {
    const cleaned = (text || "").trim();
    if (cleaned === "") {
        if (usrConfig.showNotifications) {
            new electron_1.Notification({
                icon: appIcon,
                title: "Windows OCR",
                body: "No text detected in the selected area.",
            }).show();
        }
        return { ok: true, length: 0, preview: "" };
    }
    // 1) Clipboard — done in main (not renderer) so it doesn't depend on the
    //    overlay window being focused at the moment of the write.
    electron_1.clipboard.writeText(cleaned);
    // 2) Persist for downstream tools that the user may have enabled.
    try {
        fs_1.default.writeFileSync(path_1.default.join(os_1.default.tmpdir(), 'WindowsOCRResult.txt'), cleaned, { encoding: 'utf-8' });
    }
    catch (e) {
        console.error("[ocr] writing result txt failed:", e);
    }
    // 3) Optional toast with text preview (truncated, whitespace collapsed).
    const preview = makePreview(cleaned, usrConfig.notificationPreviewLength || 60);
    if (usrConfig.showNotifications) {
        // Notification failures (permission denied, focus assist on, etc.) are
        // intentionally swallowed — clipboard already succeeded, so the user
        // got what they came for.
        try {
            new electron_1.Notification({
                icon: appIcon,
                title: "Text copied to clipboard",
                body: `${cleaned.length} chars • ${preview}`,
            }).show();
        }
        catch (e) {
            console.error("[ocr] notification failed:", e);
        }
    }
    // 4) Opt-in Notepad spawn (legacy behavior — kept for users who relied on it).
    if (usrConfig.openNotepad && process.platform === 'win32') {
        try {
            child_process_1.default.spawn("C:\\Windows\\notepad.exe", [path_1.default.join(os_1.default.tmpdir(), 'WindowsOCRResult.txt')]);
        }
        catch (e) {
            console.error("[ocr] notepad spawn failed:", e);
        }
    }
    // 5) History.
    appendToHistory(cleaned);
    return { ok: true, length: cleaned.length, preview };
}
function handleOCRError(err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ocr] error:", msg);
    if (usrConfig.showNotifications) {
        try {
            new electron_1.Notification({
                icon: appIcon,
                title: "OCR failed",
                body: msg.length > 200 ? msg.slice(0, 200) + '…' : msg,
            }).show();
        }
        catch ( /* ignore */_a) { /* ignore */ }
    }
}
// ---------- Tray menu (lazy rebuild for history submenu) ----------
function rebuildTrayMenu() {
    if (!(mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.tray))
        return;
    const historyItems = history.length === 0
        ? [{ label: "(empty)", enabled: false }]
        : history.map((h, idx) => ({
            label: `${idx + 1}. ${h.preview}`,
            toolTip: `${h.charCount} chars • ${new Date(h.timestamp).toLocaleString()}`,
            click: () => {
                electron_1.clipboard.writeText(h.text);
                if (usrConfig.showNotifications) {
                    try {
                        new electron_1.Notification({
                            icon: appIcon,
                            title: "Re-copied from history",
                            body: `${h.charCount} chars • ${h.preview}`,
                        }).show();
                    }
                    catch ( /* ignore */_a) { /* ignore */ }
                }
            },
        }));
    const menu = electron_1.Menu.buildFromTemplate([
        { label: "Windows OCR", icon: trayIcon, enabled: false },
        { type: "separator" },
        { label: "Launch", click: () => createScreenshotWindow() },
        { label: "Settings", click: () => { if (!aboutWindow)
                createAboutWindow();
            else
                aboutWindow.focus(); } },
        { type: "separator" },
        { label: "History", submenu: historyItems },
        { type: "separator" },
        { role: "quit" },
    ]);
    mainWindow.tray.setContextMenu(menu);
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
    mainWindow.tray.setToolTip("Windows OCR");
    // Initial menu (also rebuilt whenever history changes).
    rebuildTrayMenu();
}
function overlayPngPath(displayId) {
    return path_1.default.join(os_1.default.tmpdir(), `WindowsOCR_${displayId}.png`);
}
function closeAllOverlays() {
    mmlog("closing all overlays:", overlayWindows.size);
    // Snapshot and clear up-front so the 'closed' listener (which calls
    // overlayWindows.delete) can't race with this iteration.
    const wins = Array.from(overlayWindows.values());
    overlayWindows.clear();
    for (const win of wins) {
        if (!win.isDestroyed())
            win.close();
    }
}
function cleanupOverlayPngs() {
    // Best-effort cleanup of per-display screenshots written to tmpdir. Stale
    // files would survive across runs otherwise and slowly accumulate.
    try {
        const tmp = os_1.default.tmpdir();
        for (const name of fs_1.default.readdirSync(tmp)) {
            if (/^WindowsOCR_\d+\.png$/.test(name)) {
                try {
                    fs_1.default.unlinkSync(path_1.default.join(tmp, name));
                }
                catch ( /* ignore */_a) { /* ignore */ }
            }
        }
    }
    catch (e) {
        mmlog("cleanupOverlayPngs failed:", e);
    }
}
function createScreenshotWindow() {
    return __awaiter(this, void 0, void 0, function* () {
        // Re-trigger of the hotkey while overlays already exist: just focus and bail.
        if (overlayWindows.size > 0) {
            const first = overlayWindows.values().next().value;
            if (first && !first.isDestroyed())
                first.focus();
            return;
        }
        // Always re-enumerate displays — handles hot-plug without any cache.
        const displays = electron_1.screen.getAllDisplays();
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
        let sources = [];
        try {
            sources = yield electron_1.desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: maxPhysW, height: maxPhysH }
            });
        }
        catch (e) {
            console.error("[multimon] desktopCapturer.getSources failed:", e);
            return;
        }
        mmlog("sources:", sources.map(s => ({ id: s.id, display_id: s.display_id, name: s.name })));
        // Match sources to displays by display_id. Electron returns display_id as a
        // string; display.id is numeric. When display_id is empty (older Electron
        // or some Linux setups), fall back to positional matching.
        const displayPngPaths = new Map();
        displays.forEach((display, idx) => {
            let source = sources.find(s => s.display_id && s.display_id === display.id.toString());
            if (!source)
                source = sources[idx];
            if (!source) {
                mmlog("no source available for display", display.id);
                return;
            }
            const filePath = overlayPngPath(display.id);
            fs_1.default.writeFileSync(filePath, source.thumbnail.toPNG());
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
            if (!imgPath)
                continue;
            const win = new electron_1.BrowserWindow({
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
                    preload: path_1.default.join(__dirname, 'preload.js')
                },
                icon: appIcon
            });
            win.setMenuBarVisibility(false);
            win.setIcon(appIcon);
            // 'screen-saver' is the highest stacking level; keeps the overlay above
            // taskbars and other always-on-top apps.
            win.setAlwaysOnTop(true, 'screen-saver');
            win.loadFile(path_1.default.join(__dirname, '../../src/site/index.html'));
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
// Electron accelerator modifiers (case-insensitive). See:
// https://www.electronjs.org/docs/latest/api/accelerator
const ACCELERATOR_MODIFIERS = new Set([
    'command', 'cmd', 'control', 'ctrl', 'commandorcontrol', 'cmdorctrl',
    'alt', 'option', 'altgr', 'shift', 'super', 'meta'
]);
function normalizeAccelerator(raw) {
    return raw ? raw.replace(/\s/g, '') : '';
}
// Quick structural validation before handing the string to Electron.
// Prevents `globalShortcut.register` from throwing on malformed input
// (the throw inside an IPC handler is what froze the renderer on save).
function isValidAccelerator(acc) {
    if (!acc)
        return false;
    const parts = acc.split('+').map(p => p.trim());
    if (parts.some(p => p.length === 0))
        return false;
    if (parts.length < 2)
        return false;
    const nonModifiers = parts.filter(p => !ACCELERATOR_MODIFIERS.has(p.toLowerCase()));
    return nonModifiers.length === 1;
}
function triggerCapture() {
    if (overlayWindows.size === 0) {
        console.log("OCR capture initiated");
        createScreenshotWindow();
    }
    else {
        console.log("OCR window already opened");
        // Re-focus the first overlay so the user can keep selecting.
        const first = overlayWindows.values().next().value;
        if (first && !first.isDestroyed())
            first.focus();
    }
}
function registerShortcut(config) {
    // Always clear any previous binding first — registering the same accelerator
    // twice without unregistering is a no-op on some platforms and an error on
    // others, and was contributing to inconsistent state across save attempts.
    electron_1.globalShortcut.unregisterAll();
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
    if (electron_1.globalShortcut.isRegistered(accelerator)) {
        console.log(`Global shortcut '${accelerator}' is already in use by another app`);
        return { success: false, reason: "conflict", error: `'${accelerator}' is already in use by another app` };
    }
    // `register` can throw synchronously on malformed accelerators that pass
    // our pre-check (Electron internals). Wrapping in try/catch keeps the IPC
    // handler responsive — without it the renderer's `invoke` never resolves
    // and the settings window appears frozen.
    try {
        const ok = electron_1.globalShortcut.register(accelerator, triggerCapture);
        if (!ok) {
            console.log("Global shortcut registration failed");
            return { success: false, reason: "reg_failed", error: "Failed to register the shortcut" };
        }
        console.log(`Global shortcut '${accelerator}' registered`);
        return { success: true, reason: "" };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[Hotkey] register threw:", msg);
        return { success: false, reason: "exception", error: msg };
    }
}
electron_1.app.whenReady().then(() => __awaiter(void 0, void 0, void 0, function* () {
    if (fs_1.default.existsSync(path_1.default.join(process.cwd(), 'credentials.json')))
        process.env.GOOGLE_APPLICATION_CREDENTIALS = path_1.default.join(process.cwd(), 'credentials.json');
    else {
        createErrorDialog("Windows OCR", "Cannot find 'credentials.json' inside the application's directory. Please follow "
            + "the initial setup process at the GitHub repository if you have not already.");
    }
    history = loadHistory();
    electron_1.ipcMain.handle('ocr:perform', (event, message) => __awaiter(void 0, void 0, void 0, function* () {
        var _a, _b, _c;
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
                fs_1.default.copyFileSync(path_1.default.join(os_1.default.tmpdir(), 'WindowsOCRCrop.png'), path_1.default.join(os_1.default.homedir(), 'Pictures', 'Screenshots', fileName));
                if (usrConfig.showNotifications) {
                    try {
                        new electron_1.Notification({
                            icon: appIcon,
                            title: "Screenshot saved",
                            body: "Saved to " + os_1.default.homedir() + "\\Pictures\\Screenshots\\" + fileName,
                        }).show();
                    }
                    catch ( /* ignore */_d) { /* ignore */ }
                }
            }
            const result = yield googleClient.documentTextDetection(path_1.default.join(os_1.default.tmpdir(), 'WindowsOCRCrop.png'));
            const text = (_c = (_b = (_a = result === null || result === void 0 ? void 0 : result[0]) === null || _a === void 0 ? void 0 : _a.fullTextAnnotation) === null || _b === void 0 ? void 0 : _b.text) !== null && _c !== void 0 ? _c : "";
            return handleOCRResult(text);
        }
        catch (err) {
            handleOCRError(err);
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }));
    electron_1.ipcMain.handle('config:load', (event, message) => {
        return loadConfig();
    });
    electron_1.ipcMain.handle('config:save', (event, config) => {
        var _a, _b, _c;
        // Try to register the new shortcut FIRST. Persisting to disk before
        // validation could trap users in a crash loop: a bad accelerator
        // would re-trigger the same failure on every startup.
        const candidateConfig = {
            keyboardShortcut: config.shortcut,
            saveAsScreenshot: config.ss,
            openNotepad: config.notepad,
            showNotifications: (_a = config.showNotifications) !== null && _a !== void 0 ? _a : usrConfig.showNotifications,
            notificationPreviewLength: (_b = config.notificationPreviewLength) !== null && _b !== void 0 ? _b : usrConfig.notificationPreviewLength,
        };
        const regResult = registerShortcut(candidateConfig);
        // "empty" is acceptable: the user explicitly cleared the shortcut and
        // the app falls back to tray-only operation.
        if (!regResult.success && regResult.reason !== "empty") {
            // Re-apply the previously working shortcut so the user is not left
            // with no binding at all after a failed update.
            registerShortcut(usrConfig);
            return { success: false, error: (_c = regResult.error) !== null && _c !== void 0 ? _c : "Failed to update shortcut", reason: regResult.reason };
        }
        saveConfig(candidateConfig);
        usrConfig = loadConfig();
        new electron_1.Notification({
            icon: appIcon,
            title: "Saved successfully",
            body: "Configuration was updated and changes have been implemented successfully."
        }).show();
        return { success: true };
    });
    electron_1.ipcMain.on('window:close', (event, args) => {
        // Tear down every overlay unconditionally. Previously this was gated by
        // `args.error === ""`, which meant an OCR failure would leave the
        // overlay open. The success-side effects (clipboard, notification,
        // notepad, screenshot copy) all moved into `ocr:perform`, so this
        // handler is now just window lifecycle.
        closeAllOverlays();
        cleanupOverlayPngs();
    });
    electron_1.ipcMain.on('overlay:selection-started', (event, displayId) => {
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
    if (!shortcutRegSuccess.success && shortcutRegSuccess.reason !== "empty") {
        createWarningDialog("Windows OCR", "Failed to register a global shortcut to launch the OCR window. "
            + (shortcutRegSuccess.error ? `Reason: ${shortcutRegSuccess.error}. ` : "")
            + "You can change it in Settings or restart the app.");
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
    closeAllOverlays();
    aboutWindow = null;
    // Best-effort temp cleanup. The original unlinkSync() calls threw if any
    // file was already missing (e.g. user quit before ever capturing) and that
    // exception aborted the rest of the cleanup.
    const tmpFiles = [
        path_1.default.join(os_1.default.tmpdir(), 'WindowsOCRCrop.png'),
        path_1.default.join(os_1.default.tmpdir(), 'WindowsOCRResult.txt'),
    ];
    for (const f of tmpFiles) {
        try {
            fs_1.default.unlinkSync(f);
        }
        catch ( /* ignore */_a) { /* ignore */ }
    }
    cleanupOverlayPngs();
});
// Safety net for shutdown paths that don't fire `before-quit` (e.g. taskbar
// kill, OS logout) — without this an accelerator could remain registered with
// the OS after the app exits.
electron_1.app.on("will-quit", () => {
    electron_1.globalShortcut.unregisterAll();
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
