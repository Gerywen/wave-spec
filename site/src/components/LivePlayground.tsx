import { useCallback, useEffect, useRef, useState } from "react";
import { AudioPlayerControl } from "@apc/index";
import { loadDemoTone } from "../lib/loadDemo";
import { createDemoTone } from "../lib/tone";
import { useLocale } from "../i18n/LocaleContext";
import { ui } from "../i18n/ui";

type Props = {
  initialSource: string;
};

export function LivePlayground({ initialSource }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<AudioPlayerControl | null>(null);
  const runIdRef = useRef(0);
  const { t } = useLocale();

  const [source, setSource] = useState(initialSource);
  const [status, setStatus] = useState<"idle" | "running" | "ready" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSource(initialSource);
  }, [initialSource]);

  const destroyPlayer = useCallback(() => {
    const prev = playerRef.current;
    playerRef.current = null;
    if (prev) {
      try {
        prev.destroy();
      } catch {
        /* ignore */
      }
    }
    const host = hostRef.current;
    if (host) host.replaceChildren();
  }, []);

  const run = useCallback(
    async (code: string) => {
      const host = hostRef.current;
      if (!host) return;

      const runId = ++runIdRef.current;
      setStatus("running");
      setError(null);
      destroyPlayer();

      try {
        const AsyncFunction = Object.getPrototypeOf(async function () {})
          .constructor as new (
          ...args: string[]
        ) => (...args: unknown[]) => Promise<unknown>;

        const fn = new AsyncFunction(
          "AudioPlayerControl",
          "container",
          "loadDemo",
          "createDemoTone",
          `${code}\n;return (typeof player !== "undefined" ? player : null);`,
        );

        const result = await fn(
          AudioPlayerControl,
          host,
          loadDemoTone,
          createDemoTone,
        );

        if (runId !== runIdRef.current) {
          if (
            result &&
            typeof (result as AudioPlayerControl).destroy === "function"
          ) {
            try {
              (result as AudioPlayerControl).destroy();
            } catch {
              /* ignore */
            }
          }
          return;
        }

        if (
          !result ||
          typeof (result as AudioPlayerControl).destroy !== "function"
        ) {
          throw new Error(t(ui.needPlayer));
        }

        playerRef.current = result as AudioPlayerControl;
        setStatus("ready");
      } catch (err) {
        if (runId !== runIdRef.current) return;
        destroyPlayer();
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setStatus("error");
      }
    },
    [destroyPlayer, t],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void run(source);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [source, run]);

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
      destroyPlayer();
    };
  }, [destroyPlayer]);

  const statusLabel =
    status === "ready"
      ? t(ui.statusReady)
      : status === "running"
        ? t(ui.statusRunning)
        : status === "error"
          ? t(ui.statusError)
          : t(ui.statusIdle);

  return (
    <div className="live-playground">
      <section className="live-code" aria-labelledby="live-code-heading">
        <header className="live-code-bar">
          <div className="live-code-bar-text">
            <h2 id="live-code-heading">{t(ui.editableCode)}</h2>
            <p className="live-code-hint">{t(ui.codeHint)}</p>
          </div>
          <div className="live-code-actions">
            <button
              type="button"
              className="live-code-btn"
              onClick={() => void run(source)}
            >
              {t(ui.runNow)}
            </button>
            <button
              type="button"
              className="live-code-btn live-code-btn-ghost"
              onClick={() => setSource(initialSource)}
            >
              {t(ui.reset)}
            </button>
            <span className={`live-code-status live-code-status-${status}`}>
              {statusLabel}
            </span>
          </div>
        </header>
        <textarea
          className="live-code-editor"
          spellCheck={false}
          value={source}
          aria-label={t(ui.codeAria)}
          onChange={(e) => setSource(e.target.value)}
        />
        {error && (
          <pre className="live-code-error" role="alert">
            {error}
          </pre>
        )}
      </section>

      <div className="live-preview">
        <div ref={hostRef} className="player-host" />
        {status === "running" && (
          <div className="live-preview-overlay" aria-live="polite">
            {t(ui.runningOverlay)}
          </div>
        )}
      </div>
    </div>
  );
}
