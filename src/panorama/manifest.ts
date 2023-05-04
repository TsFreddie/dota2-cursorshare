type Time = number;

const lerp = (start: number, end: number, t: number) => {
    return start + (end - start) * t;
};

interface Snapshot {
    time: Time;
    state: CursorPos;
}

interface InterpolatedSnapshot {
    state: CursorPos;
    percentage: number;
}

class Vault {
    private vault: Snapshot[] = [];
    private vaultSize: number = 120;

    get(time: number) {
        const sorted = this.vault.sort((a, b) => b.time - a.time);
        for (let i = 0; i < sorted.length; i++) {
            const snap = sorted[i];
            if (snap.time <= time) {
                const snaps = { older: sorted[i], newer: sorted[i - 1] };
                return snaps;
            }
        }
        return;
    }

    clear() {
        this.vault = [];
    }

    add(snapshot: Snapshot) {
        if (this.vault.length > this.vaultSize - 1) {
            this.vault.sort((a, b) => a.time - b.time).shift();
        }
        this.vault.push(snapshot);
    }
}

class SnapshotInterpolation {
    public vault = new Vault();
    private buffer = (1 / 30) * 2;
    private offset = -1;
    public serverTime = 0;

    public get interpolationBuffer() {
        return {
            get: () => this.buffer,
            set: (seconds: number) => {
                this.buffer = seconds;
            },
        };
    }

    public add(snapshot: Snapshot): void {
        const timeNow = Game.GetGameTime();
        const timeSnapshot = snapshot.time;

        if (this.offset === -1) {
            this.offset = timeNow - timeSnapshot;
        }

        const timeOffset = timeNow - timeSnapshot;
        const timeDifference = Math.abs(this.offset - timeOffset);
        if (timeDifference > 50) this.offset = timeOffset;

        this.vault.add(snapshot);
    }

    public reset() {
        this.vault.clear();
    }

    private interpolate(
        snapshotA: Snapshot,
        snapshotB: Snapshot,
        timeOrPercentage: number
    ): InterpolatedSnapshot {
        const sorted = [snapshotA, snapshotB].sort((a, b) => b.time - a.time);

        const newer: Snapshot = sorted[0];
        const older: Snapshot = sorted[1];

        const t0: Time = newer.time;
        const t1: Time = older.time;
        const tn: number = timeOrPercentage;

        const zeroPercent = tn - t1;
        const hundredPercent = t0 - t1;
        const pPercent =
            timeOrPercentage <= 1
                ? timeOrPercentage
                : zeroPercent / hundredPercent;

        this.serverTime = lerp(t1, t0, pPercent);

        const lerpFnc = (start: CursorPos, end: CursorPos, t: number) => {
            return vadd3(start, vmul3(vsub3(end, start), t));
        };

        const newerState: CursorPos = newer.state;
        const olderState: CursorPos = older.state;

        const interpolatedSnapshot: InterpolatedSnapshot = {
            state: lerpFnc(olderState, newerState, pPercent),
            percentage: pPercent,
        };

        return interpolatedSnapshot;
    }

    /** Get the calculated interpolation on the client. */
    public calcInterpolation(time: number): InterpolatedSnapshot | undefined {
        const serverTime = time - this.offset - this.buffer;

        const shots = this.vault.get(serverTime);
        if (!shots) return;

        const { older, newer } = shots;
        if (!older || !newer) return;

        return this.interpolate(newer, older, serverTime);
    }
}

type UpdateCallback = (time: number, deltaTime: number) => void;

const frameEvents: { [key: string]: UpdateCallback } = {};
let lastTime = 0;
const runFrames = () => {
    $.GetContextPanel().style.visibility = "visible";
    const time = Game.GetGameTime();
    const deltaTime = Game.GetGameFrameTime();
    for (const key in frameEvents) {
        frameEvents[key](time, deltaTime);
    }
    $.Schedule(0, runFrames);
};

$.Schedule(0, runFrames);

const vsub = (a: [number, number], b: [number, number]): [number, number] => [
    a[0] - b[0],
    a[1] - b[1],
];
const vadd = (a: [number, number], b: [number, number]): [number, number] => [
    a[0] + b[0],
    a[1] + b[1],
];
const vmul = (a: [number, number], b: number): [number, number] => [
    a[0] * b,
    a[1] * b,
];
const vdiv = (a: [number, number], b: number): [number, number] => [
    a[0] / b,
    a[1] / b,
];
const vlen = (a: [number, number]): number =>
    Math.sqrt(a[0] * a[0] + a[1] * a[1]);

const vsub3 = (a: CursorPos, b: CursorPos): CursorPos => [
    a[0] - b[0],
    a[1] - b[1],
    a[2] - b[2],
];
const vadd3 = (a: CursorPos, b: CursorPos): CursorPos => [
    a[0] + b[0],
    a[1] + b[1],
    a[2] + b[2],
];
const vmul3 = (a: CursorPos, b: number): CursorPos => [
    a[0] * b,
    a[1] * b,
    a[2] * b,
];
const vdiv3 = (a: CursorPos, b: number): CursorPos => [
    a[0] / b,
    a[1] / b,
    a[2] / b,
];
const vlen3 = (a: CursorPos): number =>
    Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);

class CursorInstance {
    private id: PlayerID;
    private color: number;
    private cursor: Panel;
    private snapshotInterpolation: SnapshotInterpolation;
    private lastMode: "s" | "w";

    constructor(id: PlayerID) {
        this.lastMode = "s";
        this.color = 0;
        this.id = id;
        this.cursor = $.CreatePanel(
            "Panel",
            $.GetContextPanel(),
            `SharedCursor_${id}`
        );
        this.cursor.AddClass("SharedCursor");
        this.cursor.hittest = false;

        const enemy =
            Players.GetTeam(id) !== Players.GetTeam(Players.GetLocalPlayer());
        this.snapshotInterpolation = new SnapshotInterpolation();
        if (enemy) {
            this.cursor.AddClass("Enemy");
        }

        frameEvents[id] = (time, deltaTime) => {
            this.draw(time, deltaTime);
        };
    }

    public update(x: number, y: number, z: number, t: number, m: "s" | "w") {
        if (m != this.lastMode) {
            this.lastMode = m;
            this.snapshotInterpolation.reset();
        }

        const pos: CursorPos = [x, y, z];
        this.snapshotInterpolation.add({
            time: t,
            state: pos,
        });

        const color = Players.GetPlayerColor(this.id);

        if (color === this.color) return;
        const ABGR = color.toString(16);
        const RGBA =
            ABGR[6] +
            ABGR[7] +
            ABGR[4] +
            ABGR[5] +
            ABGR[2] +
            ABGR[3] +
            ABGR[0] +
            ABGR[1];
        this.cursor.style.washColor = `#${RGBA}`;
    }

    public draw(time: number, deltaTime: number) {
        const result = this.snapshotInterpolation.calcInterpolation(time);
        if (this.lastMode === "s") {
            if (result) {
                const originalX = result.state[0];
                const y = result.state[1];

                const screenHeight = Game.GetScreenHeight();
                const screenWidth = Game.GetScreenWidth();

                const scaleFactor = 1080 / screenHeight;
                const scaledWidth = screenWidth * scaleFactor;

                const x = originalX - (1920 - scaledWidth) / 2;

                this.cursor.style.position = `${x}px ${y}px 0px`;
                if (x < -50 || x > screenWidth || y < -50 || y > screenHeight) {
                    this.cursor.style.visibility = "collapse";
                } else {
                    this.cursor.style.visibility = "visible";
                }
            }
        } else if (this.lastMode === "w") {
            if (result) {
                const sx = Game.WorldToScreenX(
                    result.state[0],
                    result.state[1],
                    result.state[2]
                );
                const sy = Game.WorldToScreenY(
                    result.state[0],
                    result.state[1],
                    result.state[2]
                );

                const screenWidth = Game.GetScreenWidth();
                const screenHeight = Game.GetScreenHeight();

                const scaleFactor = 1080 / screenHeight;
                const x = sx * scaleFactor;
                const y = sy * scaleFactor;
                const scaledWidth = screenWidth * scaleFactor;

                this.cursor.style.position = `${x}px ${y}px 0px`;
                if (x < -50 || x > scaledWidth || y < -50 || y > 1080) {
                    this.cursor.style.visibility = "collapse";
                } else {
                    this.cursor.style.visibility = "visible";
                }
            }
        }
    }

    public dispose() {
        this.cursor.DeleteAsync(0);
        delete frameEvents[this.id];
    }
}

let lastWorldPos: CursorPos = [0, 0, 0];

const cursors: { [id: number]: CursorInstance } = {};

const CursorShare = () => {
    $.Schedule(1 / 30, CursorShare);
    const screenMode = Game.GameStateIsBefore(
        DOTA_GameState.DOTA_GAMERULES_STATE_PRE_GAME
    );

    if (screenMode) {
        const cursor = GameUI.GetCursorPosition();

        const screenHeight = Game.GetScreenHeight();
        const screenWidth = Game.GetScreenWidth();

        const scaleFactor = 1080 / screenHeight;
        const scaledWidth = screenWidth * scaleFactor;
        const scaledX = cursor[0] * scaleFactor;
        const x = scaledX + (1920 - scaledWidth) / 2;
        const y = cursor[1] * scaleFactor;

        const msg: CursorEvent = {
            i: Players.GetLocalPlayer(),
            t: Game.GetGameTime(),
            c: [x, y, 0],
            m: "s",
        };

        GameEvents.SendCustomGameEventToAllClients("ce", msg);
    } else {
        const cursor = GameUI.GetCursorPosition();
        const worldPos = GameUI.GetScreenWorldPosition(cursor);
        if (worldPos) {
            lastWorldPos = worldPos;
        }

        const msg: CursorEvent = {
            i: Players.GetLocalPlayer(),
            t: Game.GetGameTime(),
            c: lastWorldPos,
            m: "w",
        };
        GameEvents.SendCustomGameEventToAllClients("ce", msg);
    }
};

CursorShare();

GameEvents.Subscribe("ce", (ev) => {
    if (ev.i < 0) return;
    if (ev.i == Players.GetLocalPlayer() && !Game.IsInToolsMode()) return;
    if (!cursors[ev.i]) {
        cursors[ev.i] = new CursorInstance(ev.i);
    }
    const cursor = cursors[ev.i];
    cursor.update(ev.c[0], ev.c[1], ev.c[2], ev.t, ev.m);
});

GameEvents.Subscribe("ae", (ev) => {
    var particles = Particles.CreateParticle(
        "particles/ui_mouseactions/clicked_moveto.vpcf",
        ParticleAttachment_t.PATTACH_WORLDORIGIN,
        Players.GetPlayerHeroEntityIndex(Players.GetLocalPlayer())
    );
    Particles.SetParticleControl(particles, 0, [ev.c[0], ev.c[1], ev.c[2]]);
    const color = Players.GetPlayerColor(ev.i);
    const b = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const r = color & 0xff;

    Particles.SetParticleControl(particles, 1, [r, g, b]);
    $.Schedule(2, () => {
        Particles.DestroyParticleEffect(particles, false);
        Particles.ReleaseParticleIndex(particles);
    })
 
    // Particles.SetParticleAlwaysSimulate(particles);
});

const mouseCallback = (
    ev: MouseEvent,
    arg: MouseButton | MouseScrollDirection
) => {
    if (ev == "pressed") {
        if (arg > 1 || arg < 0) return false;
        const behaviour = GameUI.GetClickBehaviors();
        // if (
        //     arg == 0 &&
        //     !(
        //         behaviour != CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE &&
        //         behaviour !=
        //             CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_LEARN_ABILITY &&
        //         behaviour != CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_RADAR
        //     )
        // ) {
        //     return false;
        // }

        // if (arg == 1 && behaviour != CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE) {
        //     return false;
        // }

        const cursor = GameUI.GetCursorPosition();
        const worldPos = GameUI.GetScreenWorldPosition(cursor);
        if (!worldPos) return false;

        const msg: ActionEvent = {
            i: Players.GetLocalPlayer(),
            c: lastWorldPos,
        };
        GameEvents.SendCustomGameEventToAllClients("ae", msg);
    }
    return false;
};

GameUI.SetMouseCallback(mouseCallback);
