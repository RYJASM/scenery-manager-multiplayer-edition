/*****************************************************************************
 * Copyright (c) 2020-2026 Sadret
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

import * as Directions from "../utils/Directions";

// Track types where station property is valid (endStation=1, beginStation=2, middleStation=3)
const STATION_TRACK_TYPES = [1, 2, 3];

// Track types where brakeBoosterSpeed is valid (brakes, booster, blockBrakes and diagonal variants)
const SPEED_SETTING_TRACK_TYPES = [99, 100, 216, 337, 338, 339, 340, 349];

export function getMissingObjects(_element: TrackData): MissingObject[] {
    return [];
}

export function rotate(element: TrackData, rotation: number): TrackData {
    return {
        ...element,
        direction: Directions.rotate(element.direction, rotation),
    };
}

export function mirror(element: TrackData): TrackData {
    const trackSegment = context.getTrackSegment(element.trackType);
    const directionOffset = Number(Boolean(trackSegment?.beginDirection || 0));
    const mirroredTrackType = (trackSegment?.mirrorSegment) || element.trackType;

    return {
        ...element,
        direction: Directions.mirror(element.direction + directionOffset),
        trackType: mirroredTrackType === undefined ? element.trackType : mirroredTrackType,
    }
}

export function copyBase(
    src: TrackData | TrackElement,
    dst: TrackData | TrackElement,
): void {
    dst.direction = src.direction;
    dst.trackType = src.trackType;
    dst.rideType = src.rideType;
    dst.sequence = src.sequence;
    // For stored plain objects hasOwnProperty is true (read directly).
    // For live elements, guard by ride/track type to avoid engine log spam.
    if (Object.prototype.hasOwnProperty.call(src, "mazeEntry"))
        dst.mazeEntry = (src as any).mazeEntry;
    else if (src.rideType === 20) // RIDE_TYPE_MAZE
        dst.mazeEntry = src.mazeEntry;
    else
        dst.mazeEntry = null;
    dst.colourScheme = src.colourScheme;
    dst.seatRotation = src.seatRotation;
    dst.ride = src.ride;
    if (Object.prototype.hasOwnProperty.call(src, "station"))
        dst.station = (src as any).station;
    else if (STATION_TRACK_TYPES.indexOf(src.trackType) !== -1)
        dst.station = src.station;
    else
        dst.station = null;
    if (Object.prototype.hasOwnProperty.call(src, "brakeBoosterSpeed"))
        dst.brakeBoosterSpeed = (src as any).brakeBoosterSpeed;
    else if (SPEED_SETTING_TRACK_TYPES.indexOf(src.trackType) !== -1)
        dst.brakeBoosterSpeed = src.brakeBoosterSpeed;
    else
        dst.brakeBoosterSpeed = null;
    dst.hasChainLift = src.hasChainLift;
    dst.isInverted = src.isInverted;
    dst.hasCableLift = src.hasCableLift;
}

export function copy(src: TrackElement, dst: TrackElement): void {
    copyBase(src, dst);
}

export function copyFrom(src: TrackElement, dst: TrackData): void {
    copyBase(src, dst);
}

export function copyTo(src: TrackData, dst: TrackElement): void {
    copyBase(src, dst);
}

export function getPlaceActionData(
    coords: CoordsXY,
    element: TrackData,
    flags: number,
): PlaceActionData[] {
    if (element.sequence !== 0)
        return [];

    const zOffset = context.getTrackSegment(element.trackType)?.elements[0].z || 0;

    return [{
        type: "trackplace",
        args: {
            ...element,
            ...coords,
            z: element.baseZ - zOffset,
            flags: flags,
            brakeSpeed: element.brakeBoosterSpeed || 0,
            colour: element.colourScheme || 0,
            trackPlaceFlags:
                Number(element.hasChainLift) << 0 |
                Number(element.isInverted) << 1,
            isFromTrackDesign: false,
            seatRotation: element.seatRotation || 0,
        },
    }];
}

export function getRemoveActionData(
    coords: CoordsXY,
    element: TrackData,
    flags: number,
): RemoveActionData[] {
    if (element.sequence !== 0)
        return [];
    return [{
        type: "trackremove",
        args: {
            ...element,
            ...coords,
            z: element.baseZ,
            flags: flags,
            sequence: element.sequence || 0,
        },
    }];
}
