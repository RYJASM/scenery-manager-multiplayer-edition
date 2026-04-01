/*****************************************************************************
 * Copyright (c) 2026 RYJASM - Multiplayer Edition
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

import * as Context from "../core/Context";

import GUI from "../gui/GUI";

export function createProgressRow(): GUI.HBox {
    const statusLabel = new GUI.Label({ text: "" });

    const pauseResumeBtn = new GUI.TextButton({
        text: "Pause",
        onClick: () => {
            const state = Context.getQueueState();
            if (state.paused) Context.resume();
            else Context.pause();
        },
    });
    pauseResumeBtn.setIsDisabled(true);

    const cancelBtn = new GUI.TextButton({
        text: "Cancel",
        onClick: Context.cancel,
    });
    cancelBtn.setIsDisabled(true);

    Context.bindProgress((done, total, isPaused, operation) => {
        if (total === 0) {
            statusLabel.setText("");
            pauseResumeBtn.setText("Pause");
            pauseResumeBtn.setIsDisabled(true);
            cancelBtn.setIsDisabled(true);
        } else {
            const label = isPaused ? "Paused" : operation || "Processing";
            statusLabel.setText(label + ": " + done + " / " + total);
            pauseResumeBtn.setText(isPaused ? "Resume" : "Pause");
            pauseResumeBtn.setIsDisabled(false);
            cancelBtn.setIsDisabled(false);
        }
    });

    return new GUI.HBox([3, 1, 1]).add(statusLabel, pauseResumeBtn, cancelBtn);
}
