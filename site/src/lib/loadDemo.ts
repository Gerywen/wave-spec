import type { AudioPlayerControl } from "@apc/index";
import { createDemoTone } from "../lib/tone";

export async function loadDemoTone(player: AudioPlayerControl, seconds = 8): Promise<void> {
  await player.load(createDemoTone(seconds));
}
