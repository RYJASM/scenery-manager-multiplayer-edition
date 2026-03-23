/*****************************************************************************
 * Copyright (c) 2026 RYJASM
 *
 * The OpenRCT2 plugin "Scenery Manager Multiplayer Edition" is licensed
 * under the GNU General Public License version 3.
 *****************************************************************************/

// Global ambient types shared across the project.
// This file has no imports/exports so TypeScript treats it as a global
// declaration file, making these types available everywhere without import.

type Observer<T> = (value: T) => void;

interface Observable<T> {
    bind(observer: Observer<T>, immediate?: boolean): void;
    getValue(): T;
    setValue(value: T): void;
}

interface ObservableNumber extends Observable<number> {
    getValue(): number;
    setValue(value: number): void;
    decrement(amount?: number): void;
    increment(amount?: number): void;
}

/** A disposal/cancellation callback returned by async operations. */
type Task = () => void;
