/*****************************************************************************
 * Copyright (c) 2026 RYJASM - Multiplayer Edition
 * Copyright (c) 2020-2026 Sadret - Scenery Manager
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

import * as Coordinates from "../utils/Coordinates";
import * as Events from "../utils/Events";

/*
 * TILE SELECTION
 */

export function getTileSelection(): Selection {
    if (ui.tileSelection.range !== null)
        return {
            leftTop: Coordinates.toTileCoords(ui.tileSelection.range.leftTop),
            rightBottom: Coordinates.toTileCoords(ui.tileSelection.range.rightBottom),
        };
    else if (ui.tileSelection.tiles.length === 0)
        return undefined;
    else
        return ui.tileSelection.tiles.map(Coordinates.toTileCoords);
}

export function setTileSelection(selection: Selection): void {
    ui.tileSelection.tiles = [];
    ui.tileSelection.range = null;

    if (selection === undefined) {
        Events.tileSelectionChange.trigger(undefined);
        return;
    } else if (Array.isArray(selection))
        ui.tileSelection.tiles = selection.map(Coordinates.toWorldCoords);
    else
        ui.tileSelection.range = {
            leftTop: Coordinates.toWorldCoords(selection.leftTop),
            rightBottom: Coordinates.toWorldCoords(selection.rightBottom),
        };
    Events.tileSelectionChange.trigger(selection);
}
