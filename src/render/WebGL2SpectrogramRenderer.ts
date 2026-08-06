import type { SpectrogramData } from "../analysis/SpectrogramFrames.js";

export type WebGL2SpectrogramRendererOptions = {
  freqBinsLog?: number;
  dbFixedMin?: number;
  dbFixedMax?: number;
};

type TexturePerChannel = {
  tex: WebGLTexture;
  width: number; // frames
  height: number; // freqBinsLog
  spectrogram: SpectrogramData;
};

export class WebGL2SpectrogramRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private textures = new Map<number, TexturePerChannel>();
  private opts: Required<WebGL2SpectrogramRendererOptions>;

  private u!: {
    viewportStartSample: WebGLUniformLocation | null;
    viewportEndSample: WebGLUniformLocation | null;
    minDb: WebGLUniformLocation | null;
    maxDb: WebGLUniformLocation | null;
    dim: WebGLUniformLocation | null;
    plotW: WebGLUniformLocation | null;
    plotH: WebGLUniformLocation | null;
    plotX0: WebGLUniformLocation | null;
    plotY0: WebGLUniformLocation | null;
    dbFixedMin: WebGLUniformLocation | null;
    dbFixedMax: WebGLUniformLocation | null;
    tex: WebGLUniformLocation | null;
  };

  constructor(private readonly canvas: HTMLCanvasElement, options: WebGL2SpectrogramRendererOptions = {}) {
    this.opts = {
      freqBinsLog: options.freqBinsLog ?? 512,
      dbFixedMin: options.dbFixedMin ?? -120,
      dbFixedMax: options.dbFixedMax ?? 0,
    };

    const gl = this.canvas.getContext("webgl2", {
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 is not available");
    this.gl = gl;

    this.initGL();
  }

  /** Upload per-channel spectrogram textures (log-freq + db quantization). Call once after `spectrograms` is ready. */
  buildTextures(spectrograms: { channelCount: number; get: (ch: number) => SpectrogramData }): void {
    if (!this.gl) return;
    this.disposeTextures();

    for (let ch = 0; ch < spectrograms.channelCount; ch++) {
      const spec = spectrograms.get(ch);
      const tex = this.createLogFreqDbTexture(ch, spec);
      this.textures.set(ch, { tex, width: spec.frames, height: this.opts.freqBinsLog, spectrogram: spec });
    }
  }

  clear(r = 0.047, g = 0.055, b = 0.071, a = 1): void {
    if (!this.gl) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  renderLane(params: {
    channel: number;
    viewportStartSample: number;
    viewportEndSample: number;
    lanePlotXDevice: number; // in device pixels
    lanePlotYDevice: number; // in device pixels
    lanePlotWDevice: number; // in device pixels
    lanePlotHDevice: number; // in device pixels
    minDb: number;
    maxDb: number;
    dim: boolean;
  }): void {
    if (!this.gl || !this.program || !this.vao) return;
    const texInfo = this.textures.get(params.channel);
    if (!texInfo) return;
    const gl = this.gl;

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texInfo.tex);

    gl.uniform1f(this.u.viewportStartSample, params.viewportStartSample);
    gl.uniform1f(this.u.viewportEndSample, params.viewportEndSample);
    gl.uniform1f(this.u.minDb, params.minDb);
    gl.uniform1f(this.u.maxDb, params.maxDb);
    gl.uniform1f(this.u.dim, params.dim ? 1 : 0);
    gl.uniform1f(this.u.plotW, params.lanePlotWDevice);
    gl.uniform1f(this.u.plotH, params.lanePlotHDevice);
    gl.uniform1f(this.u.plotX0, params.lanePlotXDevice);
    gl.uniform1f(this.u.plotY0, params.lanePlotYDevice);
    gl.uniform1f(this.u.dbFixedMin, this.opts.dbFixedMin);
    gl.uniform1f(this.u.dbFixedMax, this.opts.dbFixedMax);
    gl.uniform1i(this.u.tex, 0);

    // hop is the sample distance between adjacent stored frames.
    gl.uniform1f(gl.getUniformLocation(this.program, "u_hop"), texInfo.spectrogram.hop);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_frames"), texInfo.spectrogram.frames);

    gl.viewport(params.lanePlotXDevice, params.lanePlotYDevice, params.lanePlotWDevice, params.lanePlotHDevice);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(params.lanePlotXDevice, params.lanePlotYDevice, params.lanePlotWDevice, params.lanePlotHDevice);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.SCISSOR_TEST);
  }

  private initGL(): void {
    if (!this.gl) return;
    const gl = this.gl;

    const vs = `#version 300 es
      precision highp float;
      layout(location=0) in vec2 a_pos;
      out vec2 v_uv;
      void main(){
        v_uv = a_pos * 0.5 + 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    const fs = `#version 300 es
      precision highp float;
      precision highp int;
      in vec2 v_uv;
      uniform sampler2D u_tex;
      uniform float u_viewportStartSample;
      uniform float u_viewportEndSample;
      uniform float u_minDb;
      uniform float u_maxDb;
      uniform float u_dim; // 1 or 0
      uniform float u_plotW;
      uniform float u_plotH;
      uniform float u_plotX0;
      uniform float u_plotY0;
      uniform float u_dbFixedMin;
      uniform float u_dbFixedMax;
      uniform float u_hop;   // samples between frames
      uniform float u_frames; // number of frames
      out vec4 outColor;

      float normalizeDb(float db){
        float denom = max(1e-6, (u_maxDb - u_minDb));
        return clamp((db - u_minDb) / denom, 0.0, 1.0);
      }

      vec3 spectrogramColor(float t){
        // Classic Cool Edit jet: black -> blue -> cyan -> yellow -> red -> white
        float x = pow(clamp(t, 0.0, 1.0), 0.9);
        float r = 0.0;
        float g = 0.0;
        float b = 0.0;
        if (x < 0.125) {
          float u = x / 0.125;
          r = 0.0; g = 0.0; b = 0.2 + 0.8 * u;
        } else if (x < 0.375) {
          float u = (x - 0.125) / 0.25;
          r = 0.0; g = u; b = 1.0;
        } else if (x < 0.625) {
          float u = (x - 0.375) / 0.25;
          r = u; g = 1.0; b = 1.0 - u;
        } else if (x < 0.875) {
          float u = (x - 0.625) / 0.25;
          r = 1.0; g = 1.0 - u; b = 0.0;
        } else {
          float u = (x - 0.875) / 0.125;
          r = 1.0; g = u; b = u;
        }
        return vec3(r, g, b);
      }

      void main(){
        // v_uv is in [0,1] across the current viewport.
        float xRatio = (gl_FragCoord.x - u_plotX0) / max(1.0, u_plotW);
        // yFromBottom used below; keep gl_FragCoord relative to plot origin.

        float sample = mix(u_viewportStartSample, u_viewportEndSample, xRatio);
        // frame index based on stored frame start samples
        float frame = clamp(sample / max(1e-6, u_hop), 0.0, u_frames - 1.0);
        float frameNorm = (u_frames <= 1.0) ? 0.0 : (frame / (u_frames - 1.0));

        // gl_FragCoord.y 从 viewport 底部向上增大。
        // texture：v=0 高频，v=1 低频 → 底部高频、顶部低频。
        float yFromBottom = (gl_FragCoord.y - u_plotY0) / max(1.0, u_plotH);
        float v = clamp(yFromBottom, 0.0, 1.0);

        float enc = texture(u_tex, vec2(frameNorm, v)).r; // [0..1] from R8
        float db = mix(u_dbFixedMin, u_dbFixedMax, enc);
        float t = normalizeDb(db);
        t *= mix(1.0, 0.35, u_dim); // dim lanes
        vec3 rgb = spectrogramColor(t);
        outColor = vec4(rgb, 1.0);
      }
    `;

    const prog = this.createProgram(gl, vs, fs);
    if (!prog) throw new Error("Failed to init WebGL program");
    this.program = prog;

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Failed to create VAO");
    this.vao = vao;
    gl.bindVertexArray(vao);

    const quad = new Float32Array([
      -1, -1,
      1, -1,
      1, 1,
      -1, -1,
      1, 1,
      -1, 1,
    ]);
    const buf = gl.createBuffer();
    if (!buf) throw new Error("Failed to create buffer");
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // uniforms
    const getU = (name: string) => gl.getUniformLocation(prog, name);
    this.u = {
      viewportStartSample: getU("u_viewportStartSample"),
      viewportEndSample: getU("u_viewportEndSample"),
      minDb: getU("u_minDb"),
      maxDb: getU("u_maxDb"),
      dim: getU("u_dim"),
      plotW: getU("u_plotW"),
      plotH: getU("u_plotH"),
      plotX0: getU("u_plotX0"),
      plotY0: getU("u_plotY0"),
      dbFixedMin: getU("u_dbFixedMin"),
      dbFixedMax: getU("u_dbFixedMax"),
      tex: getU("u_tex"),
    };
  }

  private createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
    const vs = this.compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      // eslint-disable-next-line no-console
      console.error("WebGL link error:", gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  private compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      // eslint-disable-next-line no-console
      console.error("WebGL shader compile error:", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  private createLogFreqDbTexture(_channel: number, spec: SpectrogramData): WebGLTexture {
    if (!this.gl) throw new Error("No GL");
    const gl = this.gl;

    const freqBinsLog = this.opts.freqBinsLog;
    const hzMin = 20;
    const hzMax = spec.sampleRate / 2;

    // Texture is R8: encodes db into 0..1 using fixed db range.
    const texData = new Uint8Array(spec.frames * freqBinsLog);

    for (let y = 0; y < freqBinsLog; y++) {
      // Texture row 0 is bottom. We want low freq on top -> top should map to low, bottom to high.
      // Thus row y=0(bottom) => high freq; row y=end(top) => low freq.
      const r = freqBinsLog <= 1 ? 0 : y / (freqBinsLog - 1);
      const hz = hzMax * Math.pow(hzMin / hzMax, r);
      const binFloat = (hz * spec.fftSize) / spec.sampleRate; // 0..bins-1
      const b0 = Math.max(0, Math.min(spec.bins - 1, Math.floor(binFloat)));
      const b1 = Math.max(0, Math.min(spec.bins - 1, b0 + 1));
      const t = binFloat - b0;

      for (let f = 0; f < spec.frames; f++) {
        const base = f * spec.bins;
        const m0 = spec.magnitudes[base + b0] ?? 0;
        const m1 = spec.magnitudes[base + b1] ?? 0;
        const mag = m0 * (1 - t) + m1 * t;
        const db = 20 * Math.log10(Math.max(mag, 1e-12));
        const enc = (db - this.opts.dbFixedMin) / (this.opts.dbFixedMax - this.opts.dbFixedMin);
        const q = Math.round(Math.max(0, Math.min(1, enc)) * 255);
        texData[y * spec.frames + f] = q;
      }
    }

    const tex = gl.createTexture();
    if (!tex) throw new Error("Failed to create texture");
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      spec.frames,
      freqBinsLog,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      texData,
    );

    return tex;
  }

  private disposeTextures(): void {
    if (!this.gl) return;
    const gl = this.gl;
    for (const t of this.textures.values()) {
      try {
        gl.deleteTexture(t.tex);
      } catch {
        /* ignore */
      }
    }
    this.textures.clear();
  }
}

