/*****************************************************************************
 * Copyright (c) 2020-2026 Sadret
 * Copyright (c) 2026 RYJASM - Multiplayer Edition
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/


import * as Storage from "./persistence/Storage";
import * as Dialogs from "./utils/Dialogs";

export function update(load: Task): void {
    const version = Storage.get<String>("version");
    if (version === undefined)
        return showVersionUndefined(load);

    const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
    if (match === null)
        return showVersionUnknown(load);

    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);

    if (major < 2)
        return showVersionTooOld(load);
    if (major > 2 || minor > 0 || patch > 9)
        return showVersionUnknown(load);

    // update to minor / patch

    load();
}

function setVersion(): void {
    Storage.set<string>("version", "2.0.9");
}

function showHotkeyAlert(): void {
    Dialogs.showAlert({
        title: "Welcome to Scenery Manager Multiplayer Edition!",
        message: [
            "Scenery Manager supports hotkeys!",
            "These are the most important ones, but there are many more:",
            "",
            "Select area: CTRL + A",
            "Copy area: CTRL + C",
            "Paste area: CTRL + V",
            "Rotate template: Z",
            "",
            "If you want to change the default bindings, go to the",
            "'Controls and Interface' tab of OpenRCT2's 'Options' window.",
        ],
    });
}

function showVersionUndefined(load: Task): void {
    Dialogs.showAlert({
        title: "Welcome to Scenery Manager Multiplayer Edition!",
        message: [
            "Thank you for using Scenery Manager Multiplayer Edition!",
            "",
            "This is the Multiplayer Edition, designed for use on",
            "multiplayer servers.",
            "",
            "It can import templates created with the original",
            "Scenery Manager plugin.",
            "",
            "You can access the plugin via the map menu in the upper toolbar.",
            "",
            "Your scenery templates will be stored in the plugin.store.json file",
            "in your OpenRCT2 user directory.",
            "",
            "Keep in mind that:",
            "- Your data will be irrecoverably lost if that file gets deleted.",
            "- Any other plugin could overwrite that file.",
            "",
            "Increase the placement delay if you see an error to slow down.",
        ],
        callback: showHotkeyAlert,
    });
    setVersion();
    return load();
}

function showVersionUnknown(load: Task): void {
    Dialogs.showConfirm({
        title: "Welcome to Scenery Manager Multiplayer Edition!",
        message: [
            "Your clipboard and library contain templates from an unknown",
            "version of the Scenery Manager plugin.",
            "",
            "Did you downgrade from a newer version?",
            "",
            "You can continue, but it may permanently break your saved",
            "templates.",
        ],
        callback: confirmed => {
            if (confirmed) {
                showHotkeyAlert();
                setVersion();
                load();
            }
        },
        okText: "Continue",
        cancelText: "Cancel",
    });
}

function showVersionTooOld(load: Task): void {
    Dialogs.showConfirm({
        title: "Welcome to Scenery Manager Multiplayer Edition!",
        message: [
            "Your library contains templates from a previous version of the",
            "Scenery Manager plugin.",
            "",
            "Unfortunately, this version of Scenery Manager is unable to handle",
            "these files.",
            "",
            "You can continue, but you will {RED}permanently lose{WINDOW_COLOUR_1} your saved",
            "templates. Please make a backup of the 'plugin.store.json' file in",
            "your OpenRCT2 user directory if you want to keep your templates.",
        ],
        callback: confirmed => {
            if (confirmed) {
                Storage.purge();
                showHotkeyAlert();
                setVersion();
                load();
            }
        },
        okText: "Continue loading",
    });
}
