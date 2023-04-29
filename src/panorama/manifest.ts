$.Msg("ui manifest loaded");

type UpdateCallback = (time: number, deltaTime: number) => void;

const frameEvents: { [key: string]: UpdateCallback } = {};
let lastTime = 0;
const runFrames = () => {
    const time = Game.GetGameTime();
    const deltaTime = Game.GetGameFrameTime();
    for (const key in frameEvents) {
        frameEvents[key](time, deltaTime);
    }
    $.Schedule(0, runFrames);
};

$.Schedule(0, runFrames);

const SPEED = 20;
const STABILIZATION = 0.75;

const vsub = (a: [number, number], b: [number, number]): [number, number] => [
    a[0] - b[0],
    a[1] - b[1],
];
const vadd = (a: [number, number], b: [number, number]): [number, number] => [
    a[0] + b[0],
    a[1] + b[1],
];
const vmul = (a: [number, number], b: number): [number, number] => [a[0] * b, a[1] * b];
const vdiv = (a: [number, number], b: number): [number, number] => [a[0] / b, a[1] / b];
const vlen = (a: [number, number]): number => Math.sqrt(a[0] * a[0] + a[1] * a[1]);

class CursorInstance {
    private cursor: Panel;
    private lastPos: [number, number] = [0, 0];
    private lastTime: number = 0;
    private currentPos: [number, number] = [0, 0];
    private currentTime: number = 0;
    private id: PlayerID;

    // custom smoothing
    private lastDrawPos: [number, number] = [0, 0];
    private drawPos: [number, number] = [0, 0];
    private entropy = 0.5;

    constructor(id: PlayerID) {
        this.id = id;
        this.cursor = $.CreatePanel(
            "Panel",
            $.GetContextPanel(),
            `SharedCursor_${id}`
        );
        this.cursor.AddClass("SharedCursor");

        const color = Players.GetPlayerColor(id);
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

        frameEvents[id] = (time, deltaTime) => {
            this.draw(time, deltaTime);
        };
    }

    public update(x: number, y: number, z: number, t: number) {
        const sx = Game.WorldToScreenX(x, y, z);
        const sy = Game.WorldToScreenY(x, y, z);

        const scaleFactor = 1080 / Game.GetScreenHeight();
        const scaleX = sx * scaleFactor;
        const scaleY = sy * scaleFactor;

        this.lastPos = this.currentPos;
        this.lastTime = this.currentTime;
        this.currentPos = [scaleX, scaleY];
        this.currentTime = t;
    }

    public draw(time: number, deltaTime: number) {
        const lastX = this.lastPos[0];
        const lastY = this.lastPos[1];

        const x = this.currentPos[0];
        const y = this.currentPos[1];

        const elapsed = this.currentTime - this.lastTime;

        if (elapsed > 0.0001) {
            const extrapolatedX =
                x + ((x - lastX) * (time - this.currentTime)) / elapsed;
            const extrapolatedY =
                y + ((y - lastY) * (time - this.currentTime)) / elapsed;

            const targetValue: [number, number] = [extrapolatedX, extrapolatedY];

            this.entropy += SPEED * deltaTime;
            this.entropy -=
                vlen(vsub(targetValue, this.lastDrawPos)) *
                Math.log10(STABILIZATION + 1.0) *
                0.02;
            this.entropy = Math.min(Math.max(this.entropy, 0.0), SPEED);

            this.drawPos = vadd(this.drawPos, 
                vmul(vsub(targetValue, this.drawPos),
                Math.min(Math.max(deltaTime * this.entropy, 0.0), 1.0));
            this.lastDrawPos = targetValue;

            this.cursor.style.position = `${this.drawPos[0] + 50}px ${
                this.drawPos[1] + 50
            }px 0px`;
        }
    }

    public dispose() {
        this.cursor.DeleteAsync(0);
        delete frameEvents[this.id];
    }
}

let lastWorldPos: CursorPos = [0, 0, 0];
let lastScreenPos: CursorPos = [0, 0, 0];

const cursors: { [id: number]: CursorInstance } = {};

const CursorShare = () => {
    $.Schedule(1 / 30, CursorShare);
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
};

CursorShare();

GameEvents.Subscribe("ce", (ev) => {
    if (ev.i < 0) return;
    if (!cursors[ev.i]) {
        cursors[ev.i] = new CursorInstance(ev.i);
    }
    const cursor = cursors[ev.i];
    cursor.update(ev.c[0], ev.c[1], ev.c[2], ev.t);
});
