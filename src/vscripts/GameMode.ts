import { reloadable } from "./lib/tstl-utils";
declare global {
    interface CDOTAGameRules {
        Addon: GameMode;
    }
}

@reloadable
export class GameMode {
    public static Precache(this: void, context: CScriptPrecacheContext) {
        PrecacheResource(
            "particle",
            "particles/clicked_custom.vpcf",
            context
        );
    }

    public static Activate(this: void) {
    }
}
