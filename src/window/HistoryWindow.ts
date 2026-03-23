/*****************************************************************************
 * Copyright (c) 2020-2026 Sadret
 * Copyright (c) 2026 RYJASM - Multiplayer Edition
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

import * as Context from "../core/Context";

import GUI from "../gui/GUI";
import MainWindow from "./MainWindow";

const WIDTH = 300;
const LIST_HEIGHT = 200;

const statusLabel = new GUI.Label({ text: "" });

// Three-column list: ["Undo"/"Redo", description, count]
const listView = new GUI.ListView(
    {
        showColumnHeaders: false,
        columns: [
            { width: 60 },
            { width: 163 },
            { width: 45 },
        ] as Partial<ListViewColumn>[],
        scrollbars: "vertical",
        onClick: (row: number, _col: number) => handleClick(row),
    },
    LIST_HEIGHT,
);

function handleClick(row: number): void {
    const { entries } = Context.getHistoryState();
    // Rows are displayed newest-first: row 0 = entries[entries.length - 1]
    const entryIndex = entries.length - 1 - row;
    if (entryIndex < 0 || entryIndex >= entries.length) return;
    const entry = entries[entryIndex];
    if (entry.applied)
        Context.undoEntry(entry.id);
    else
        Context.redoEntry(entry.id);
}

function refresh(): void {
    const { entries } = Context.getHistoryState();
    if (entries.length === 0) {
        listView.setItems([["", "(no actions recorded)", ""]]);
        statusLabel.setText("");
        return;
    }
    const rows: string[][] = [];
    for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        rows.push([
            entry.applied ? "Undo" : "Redo",
            entry.description,
            entry.count > 1 ? "x" + entry.count : "",
        ]);
    }
    listView.setItems(rows);
    const latest = entries[entries.length - 1];
    const countSuffix = latest.count > 1 ? " x" + latest.count : "";
    statusLabel.setText("Last: " + latest.description + countSuffix);
}

// Subscribe to history changes so the list updates live
Context.bindHistory(() => {
    // Only refresh if the window is open
    if (historyWindow.getWindow() !== undefined)
        refresh();
});

const historyWindow = new GUI.WindowManager(
    {
        width: WIDTH,
        classification: "scenery-manager-multiplayer-edition.history",
        title: "Action History",
        colours: [7, 7, 6],
        onOpen: () => refresh(),
    },
    new GUI.Window().add(
        listView,
        statusLabel,
    ),
);

export function open(): void {
    const main = MainWindow.getWindow();
    if (main === undefined)
        historyWindow.open(true);
    else
        historyWindow.open(main, WIDTH);
}

export function close(): void {
    historyWindow.close();
}
