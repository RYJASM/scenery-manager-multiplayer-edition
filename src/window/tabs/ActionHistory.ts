/*****************************************************************************
 * Copyright (c) 2026 RYJASM - Multiplayer Edition
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

import * as Context from "../../core/Context";
import * as HistoryWindow from "../HistoryWindow";

import GUI from "../../gui/GUI";

const LIST_HEIGHT = 200;

const historyStatus = new GUI.Label({ text: "" });
const progressStatus = new GUI.Label({ text: "" });

const undoBtn = new GUI.TextButton({ text: "Undo", onClick: Context.undo });
const redoBtn = new GUI.TextButton({ text: "Redo", onClick: Context.redo });
const pauseResumeBtn = new GUI.TextButton({
    text: "Pause",
    onClick: () => {
        const state = Context.getQueueState();
        if (state.paused) Context.resume();
        else Context.pause();
    },
});
pauseResumeBtn.setIsDisabled(true);
const cancelBtn = new GUI.TextButton({ text: "Cancel", onClick: Context.cancel });
cancelBtn.setIsDisabled(true);

const listView = new GUI.ListView(
    {
        showColumnHeaders: false,
        columns: [
            { width: 60 },
            { width: 200 },
            { width: 45 },
        ] as Partial<ListViewColumn>[],
        scrollbars: "vertical",
        onClick: (row: number, _col: number) => handleClick(row),
    },
    LIST_HEIGHT,
);

function handleClick(row: number): void {
    const { entries } = Context.getHistoryState();
    const entryIndex = entries.length - 1 - row;
    if (entryIndex < 0 || entryIndex >= entries.length) return;
    Context.clickEntry(entries[entryIndex].id);
}

let tabOpen = false;

function refresh(): void {
    const { entries } = Context.getHistoryState();
    undoBtn.setIsDisabled(!Context.canUndo());
    redoBtn.setIsDisabled(!Context.canRedo());
    if (entries.length === 0) {
        listView.setItems([["", "(no actions recorded)", ""]]);
        historyStatus.setText("");
        return;
    }
    const queueState = Context.getQueueState();
    const rows: string[][] = [];
    for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        let statusCol: string;
        if (queueState.total > 0 && entry.id === queueState.activeEntryId) {
            if (queueState.paused || entry.status === "paused")
                statusCol = "Paused";
            else if (entry.status === "removing")
                statusCol = "Undoing...";
            else
                statusCol = queueState.operation === "Pasting" ? "Pasting..." : "Redoing...";
        } else if (entry.status === "placing" || entry.status === "removing" || entry.status === "paused") {
            statusCol = entry.status === "removing" ? "Undoing..." : (entry.status === "paused" ? "Paused" : "Redoing...");
        } else if (entry.status === "cancelled") {
            statusCol = Context.isUndoable(entry) ? "Undo*" : "Redo*";
        } else {
            statusCol = Context.isUndoable(entry) ? "Undo" : "Redo";
        }
        rows.push([statusCol, "#" + entry.id + " " + entry.description, entry.count > 1 ? "x" + entry.count : ""]);
    }
    listView.setItems(rows);
    const latest = entries[entries.length - 1];
    const countSuffix = latest.count > 1 ? " x" + latest.count : "";
    historyStatus.setText("Last: " + latest.description + countSuffix);
}

Context.bindHistory(() => {
    if (tabOpen) refresh();
});

let progressWasActive = false;
let progressWasPaused = false;
Context.bindProgress((done, total, isPaused, operation) => {
    if (total === 0) {
        progressStatus.setText("");
        pauseResumeBtn.setText("Pause");
        pauseResumeBtn.setIsDisabled(true);
        cancelBtn.setIsDisabled(true);
    } else {
        const label = isPaused ? "Paused" : operation || "Processing";
        progressStatus.setText(label + ": " + done + " / " + total);
        pauseResumeBtn.setText(isPaused ? "Resume" : "Pause");
        pauseResumeBtn.setIsDisabled(false);
        cancelBtn.setIsDisabled(false);
    }
    const isActive = total > 0;
    const needsRefresh = isActive !== progressWasActive || isPaused !== progressWasPaused;
    progressWasActive = isActive;
    progressWasPaused = isPaused;
    if (tabOpen && needsRefresh) refresh();
});

export default new GUI.Tab({
    image: 5244,
    onOpen: () => { tabOpen = true; refresh(); },
    onClose: () => { tabOpen = false; },
}).add(
    new GUI.HBox([1, 1, 1, 1]).add(undoBtn, redoBtn, pauseResumeBtn, cancelBtn),
    progressStatus,
    listView,
    historyStatus,
    new GUI.TextButton({ text: "Pop Out Window", onClick: HistoryWindow.open }),
);
