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
const kb_shortcut = document.getElementById("inp_kb_shortcut");
const checkbox_ss = document.getElementById("checkbox_ss");
const checkbox_notepad = document.getElementById("checkbox_notepad");
const save_settings_bt = document.getElementById("save_settings");
const reset_settings_bt = document.getElementById("reset_settings");
const unsaved_changes = document.getElementById("unsaved_changes");
const chk_disabled = "min-w-5 min-h-5 bg-neutral-700 rounded-sm cursor-pointer transition-all";
const chk_enabled = "min-w-5 min-h-5 bg-green-700 outline outline-2 outline-offset-[3px] outline-green-400 rounded-sm cursor-pointer transition-all";
let prev_config;
function load_config() {
    // @ts-expect-error
    return window.ocrRenderer.loadConfig()
        .then((config) => {
        prev_config = config;
        kb_shortcut.value = config.keyboardShortcut;
        checkbox_ss.className = config.saveAsScreenshot ? chk_enabled : chk_disabled;
        checkbox_ss.ariaChecked = `${config.saveAsScreenshot}`;
        checkbox_notepad.className = config.openNotepad ? chk_enabled : chk_disabled;
        checkbox_notepad.ariaChecked = `${config.openNotepad}`;
    }).catch((err) => {
        // @ts-expect-error
        window.ocrRenderer.spawnError(`An error occured when opening the configuration file. The application will exit to prevent further errors.\n\n${err.toString()}`);
    });
}
load_config();
function save_config(kb_shortcut, screenshot, notepad) {
    unsaved_changes.innerText = "Saving...";
    unsaved_changes.classList.add("animate-pulse");
    // @ts-expect-error
    window.ocrRenderer.saveConfig(kb_shortcut, screenshot, notepad)
        .then((state) => __awaiter(this, void 0, void 0, function* () {
        yield load_config();
        unsaved_changes.classList.add("hidden");
        unsaved_changes.classList.remove("animate-pulse");
        unsaved_changes.innerText = "• Unsaved changes";
    }))
        .catch((err) => {
        // @ts-expect-error
        window.ocrRenderer.spawnError(`An error occured when saving changes. The application will exit to prevent further errors.\n\n${err.toString()}`);
    });
}
function checkChanges(kb_shortcut) {
    if (kb_shortcut !== prev_config.keyboardShortcut
        || get_boolean(checkbox_ss.ariaChecked) !== prev_config.saveAsScreenshot
        || get_boolean(checkbox_notepad.ariaChecked) !== prev_config.openNotepad)
        unsaved_changes.classList.remove("hidden");
    else
        unsaved_changes.classList.add("hidden");
}
function get_boolean(val) {
    return /true/.test(val);
}
save_settings_bt.onclick = function (e) {
    e.preventDefault();
    save_config(kb_shortcut.value, get_boolean(checkbox_ss.ariaChecked), get_boolean(checkbox_notepad.ariaChecked));
};
reset_settings_bt.onclick = function (e) {
    e.preventDefault();
    save_config("Control + Shift + Alt + T", false, false);
};
kb_shortcut.onkeydown = function (e) {
    e.preventDefault();
    const disallowed = ["enter", "capslock", "tab"];
    const inpStr = kb_shortcut.value;
    if (!disallowed.includes(e.key)) {
        if (e.key.toLowerCase() === "backspace") {
            const idx = inpStr.lastIndexOf('+');
            kb_shortcut.value = inpStr.substring(0, idx).trim();
        }
        else if (!new RegExp('^' + e.key.toLowerCase() + '\\+|\\+' + e.key.toLowerCase() + '\\+|\\+' + e.key.toLowerCase() + '$', 'g')
            .test(inpStr.toLowerCase().replace(/\s/g, ''))) {
            if (e.key.length > 1)
                kb_shortcut.value += inpStr.length ? ` + ${e.key}` : e.key;
            else
                kb_shortcut.value += inpStr.length ? ` + ${e.key.toUpperCase()}` : e.key.toUpperCase();
        }
    }
    checkChanges(kb_shortcut.value);
};
checkbox_notepad.onclick = function (e) {
    e.preventDefault();
    checkbox_notepad.ariaChecked = `${!get_boolean(checkbox_notepad.ariaChecked)}`;
    checkbox_notepad.className = get_boolean(checkbox_notepad.ariaChecked) ? chk_enabled : chk_disabled;
    checkChanges(kb_shortcut.value);
};
checkbox_ss.onclick = function (e) {
    e.preventDefault();
    checkbox_ss.ariaChecked = `${!get_boolean(checkbox_ss.ariaChecked)}`;
    checkbox_ss.className = get_boolean(checkbox_ss.ariaChecked) ? chk_enabled : chk_disabled;
    checkChanges(kb_shortcut.value);
};
