import { AudioPlayerControl } from "../src/index";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="demo-header">
    <div>
      <h1>Audio Player Control</h1>
      <p>多分轨波形 / 语谱 · Original / Mono / Solo · 变速不变调</p>
    </div>
    <div class="demo-actions">
      <label class="file-btn">
        打开音频
        <input id="file" type="file" accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a" hidden />
      </label>
      <button type="button" id="tone">生成测试音（立体声）</button>
    </div>
  </header>
  <div id="player" class="demo-player"></div>
  <footer class="demo-footer">
    <p>
      快捷键：空格 播放/暂停 · ←/→ 微调 · Shift+←/→ 快退快进 · Home/End ·
      W/S 波形/语谱 · O/M Original/Mono · 1/2 Solo · Shift+拖拽选区 · 空格+拖拽平移 · 滚轮缩放
    </p>
  </footer>
`;

const playerHost = document.querySelector<HTMLDivElement>("#player")!;
const player = new AudioPlayerControl({ skipSeconds: 5 });
player.mount(playerHost);

const fileInput = document.querySelector<HTMLInputElement>("#file")!;
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    await player.load(file);
  } catch (e) {
    console.error(e);
    alert(e instanceof Error ? e.message : String(e));
  }
});

document.querySelector("#tone")?.addEventListener("click", async () => {
  const ctx = new AudioContext();
  const duration = 8;
  const sr = 44100;
  const buffer = ctx.createBuffer(2, sr * duration, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    const f0 = ch === 0 ? 220 : 330;
    for (let i = 0; i < data.length; i++) {
      const t = i / sr;
      const env = Math.min(1, t * 4) * Math.min(1, (duration - t) * 4);
      data[i] =
        env *
        (0.45 * Math.sin(2 * Math.PI * f0 * t) +
          0.2 * Math.sin(2 * Math.PI * f0 * 2 * t) +
          0.1 * Math.sin(2 * Math.PI * (f0 * (1 + t * 0.15)) * t));
    }
  }
  await ctx.close();
  await player.load(buffer);
});

player.bus.on("error", (err) => console.error(err));
