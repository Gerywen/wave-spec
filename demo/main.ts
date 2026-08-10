import { AudioPlayerControl } from "../src/index";
import { createDemoTone } from "./tone";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="site-bg" aria-hidden="true"></div>

  <header class="topnav">
    <a class="brand" href="#top">playback-controls</a>
    <nav class="topnav-links">
      <a href="#playground">演示</a>
      <a href="#start">上手</a>
      <a href="#guides">功能</a>
      <a href="#shortcuts">快捷键</a>
    </nav>
    <a class="topnav-cta" href="#playground">打开演示</a>
  </header>

  <main id="top">
    <section class="hero">
      <p class="hero-kicker">TypeScript · Canvas · Rust/WASM</p>
      <h1 class="hero-brand">playback-controls</h1>
      <p class="hero-lead">
        多分轨波形与语谱播放控件。缩放、选区编辑、变速不变调、固定时长录音——
        像 Cool Edit 那样在网页里把音频看清、改完。
      </p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#playground">在线试玩</a>
        <a class="btn btn-ghost" href="#start">快速上手</a>
      </div>
    </section>

    <section id="playground" class="section playground-section">
      <div class="section-head">
        <h2>交互演示</h2>
        <p>加载测试音或本地文件，直接在下方控件里体验全部功能。</p>
      </div>
      <div class="playground-bar">
        <label class="btn btn-file">
          打开音频
          <input id="file" type="file" accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a" hidden />
        </label>
        <button type="button" class="btn btn-ghost" id="tone">加载测试音</button>
        <span class="playground-hint" id="load-hint">提示：先点「加载测试音」即可开始</span>
      </div>
      <div id="player" class="playground-player"></div>
    </section>

    <section id="start" class="section">
      <div class="section-head">
        <h2>快速上手</h2>
        <p>三步接入：安装、挂载、加载音频。</p>
      </div>
      <div class="code-grid">
        <article class="code-card">
          <h3>安装</h3>
          <pre><code>npm install audio-player-control</code></pre>
        </article>
        <article class="code-card code-card-wide">
          <h3>挂载与加载</h3>
          <pre><code>import { AudioPlayerControl } from "audio-player-control";
import "audio-player-control/style.css";

const player = new AudioPlayerControl({ skipSeconds: 5 });
player.mount(document.getElementById("root")!);
await player.load(file); // File / URL / AudioBuffer</code></pre>
        </article>
      </div>
    </section>

    <section id="guides" class="section">
      <div class="section-head">
        <h2>功能讲解</h2>
        <p>对照上方演示操作；每项都是日常剪辑里最高频的能力。</p>
      </div>
      <div class="guide-grid">
        <article class="guide-card" data-reveal>
          <h3>波形与语谱</h3>
          <p>工具栏切换「波形 / 语谱」，或按 <kbd>W</kbd> / <kbd>S</kbd>。语谱一次烘焙成图，缩放平移只做裁剪，跟播更顺滑。</p>
        </article>
        <article class="guide-card" data-reveal>
          <h3>选区与导航</h3>
          <p><kbd>Shift</kbd>+拖拽划选；滚轮缩放；空格或 <kbd>Alt</kbd>+拖拽平移。可开「吸附到过零点」「跟随」。</p>
        </article>
        <article class="guide-card" data-reveal>
          <h3>编辑</h3>
          <p>剪切 / 复制 / 粘贴 / 删除选区，撤销重做。有选区粘贴会替换，无选区则在游标插入。编辑中若正在播放会自动续播。</p>
        </article>
        <article class="guide-card" data-reveal>
          <h3>导出</h3>
          <p>「导出选区」或「导出整段」下载 16-bit PCM WAV，适合交给下游工具继续处理。</p>
        </article>
        <article class="guide-card" data-reveal>
          <h3>变速不变调</h3>
          <p>倍速下拉切换。WSOLA 按约 45 秒窗口分段拉伸并预热常用倍率，长音频切速不再整段卡死。</p>
        </article>
        <article class="guide-card" data-reveal>
          <h3>固定时长录音</h3>
          <p>选 1 / 5 / 10 / 30 分钟后点「录音」。整段时间轴一屏显示，波形从左生长；停录后进入完整编辑管线。</p>
        </article>
        <article class="guide-card" data-reveal>
          <h3>通道路由</h3>
          <p>Original / Mono / Solo（快捷键 <kbd>O</kbd> <kbd>M</kbd> <kbd>1</kbd> <kbd>2</kbd>）。分轨显示上 L 下 R，可联动增益。</p>
        </article>
        <article class="guide-card" data-reveal>
          <h3>仅播选区</h3>
          <p>勾选「仅播放选区」与「选区循环」，适合反复听某一段再决定剪辑点。</p>
        </article>
      </div>
    </section>

    <section id="shortcuts" class="section">
      <div class="section-head">
        <h2>快捷键</h2>
        <p>焦点不在输入框时生效（与 Wavesurfer 文档站一样，建议扫一眼再上手）。</p>
      </div>
      <div class="table-wrap">
        <table class="keys-table">
          <thead>
            <tr><th>按键</th><th>作用</th></tr>
          </thead>
          <tbody>
            <tr><td><kbd>Space</kbd></td><td>播放 / 暂停</td></tr>
            <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>微调游标</td></tr>
            <tr><td><kbd>Shift</kbd>+<kbd>←</kbd>/<kbd>→</kbd></td><td>快退 / 快进</td></tr>
            <tr><td><kbd>Home</kbd> <kbd>End</kbd></td><td>到开头 / 结尾</td></tr>
            <tr><td><kbd>W</kbd> <kbd>S</kbd></td><td>波形 / 语谱</td></tr>
            <tr><td><kbd>Ctrl/⌘</kbd>+<kbd>X</kbd> <kbd>C</kbd> <kbd>V</kbd></td><td>剪切 / 复制 / 粘贴</td></tr>
            <tr><td><kbd>Delete</kbd></td><td>删除选区</td></tr>
            <tr><td><kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd></td><td>撤销</td></tr>
            <tr><td><kbd>Shift</kbd>+拖拽</td><td>选区</td></tr>
            <tr><td>滚轮</td><td>缩放</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div>
      <strong>playback-controls</strong>
      <p>多分轨波形 / 语谱音频播放控件 · MIT</p>
    </div>
    <a href="https://github.com/Gerywen/wave-spec" target="_blank" rel="noreferrer">
      查看仓库
    </a>
  </footer>
`;

const playerHost = document.querySelector<HTMLDivElement>("#player")!;
const hint = document.querySelector<HTMLSpanElement>("#load-hint")!;
const player = new AudioPlayerControl({ skipSeconds: 5 });
player.mount(playerHost);

async function loadTone(): Promise<void> {
  hint.textContent = "正在生成测试音…";
  try {
    const buffer = createDemoTone(8);
    await player.load(buffer);
    hint.textContent = "已加载测试音 · 可按空格播放，Shift+拖拽选区";
  } catch (e) {
    console.error(e);
    hint.textContent = e instanceof Error ? e.message : String(e);
  }
}

document.querySelector("#tone")?.addEventListener("click", () => {
  void loadTone();
});

const fileInput = document.querySelector<HTMLInputElement>("#file")!;
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  hint.textContent = `正在加载 ${file.name}…`;
  try {
    await player.load(file);
    hint.textContent = `已加载：${file.name}`;
  } catch (e) {
    console.error(e);
    hint.textContent = e instanceof Error ? e.message : String(e);
    alert(hint.textContent);
  }
});

player.bus.on("error", (err) => {
  console.error(err);
  hint.textContent = err.message;
});

// Reveal cards on scroll
const revealEls = document.querySelectorAll<HTMLElement>("[data-reveal]");
const io = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
);
for (const el of revealEls) io.observe(el);

// Auto-load tone so the playground is never empty on first visit
void loadTone();
