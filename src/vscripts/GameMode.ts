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
            "particles/ui_mouseactions/clicked_moveto.vpcf",
            context
        );
    }

    public static Activate(this: void) {
        // CustomGameEventManager.RegisterListener("ae", (i, ev) => {
        //     print("ae", i, ev);
        //     const id = ParticleManager.CreateParticle(
        //         "particles/ui_mouseactions/clicked_moveto.vpcf",
        //         ParticleAttachment.WORLDORIGIN,
        //         PlayerResource.GetSelectedHeroEntity(ev.i)
        //     );
        //     print(ev.c[0], ev.c[1], ev.c[2]);
        //     ParticleManager.SetParticleControl(
        //         id,
        //         0,
        //         Vector(ev.c[0], ev.c[1], ev.c[2])
        //     );
        // });
    }
}
