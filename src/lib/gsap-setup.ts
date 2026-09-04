import { gsap } from "gsap";
import type { CompositionSetup } from "framediff";

interface ProjectGsapContext {
  gsap: typeof gsap;
  frames(value: number): number;
  unroll(id: string, timeline: gsap.core.Timeline, build: () => void): void;
}

type BuildTimeline = (context: ProjectGsapContext) => gsap.core.Timeline;

/** Project-owned GSAP adapter: FrameDiff remains the only clock and source mutation is not exposed. */
export function defineGsapTimeline(build: BuildTimeline): CompositionSetup {
  return ({ root, composition, onFrame, onCleanup }) => {
    let timeline: gsap.core.Timeline | undefined;
    const scope = gsap.context(() => {
      timeline = build({
        gsap,
        frames: (value) => value / composition.fps,
        unroll: (_id, _timeline, unrollBuild) => unrollBuild(),
      }).pause(0);
    }, root);
    if (!timeline) throw new Error(`GSAP setup for ${composition.id} did not return a timeline.`);
    const activeTimeline = timeline;
    const stopFrame = onFrame(({ time }) => {
      activeTimeline.totalTime(time, true);
    });
    onCleanup(() => {
      stopFrame();
      activeTimeline.kill();
      scope.revert();
    });
  };
}
