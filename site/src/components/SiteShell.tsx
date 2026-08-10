import { Link, NavLink, Outlet } from "react-router-dom";
import { EXAMPLES } from "../examples";
import { useLocale } from "../i18n/LocaleContext";
import { ui } from "../i18n/ui";
import type { Locale } from "../i18n/types";

export function SiteShell() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div className="site">
      <div className="site-bg" aria-hidden />

      <aside className="sidebar">
        <div className="sidebar-top">
          <Link className="brand" to="/">
            playback-controls
          </Link>
          <div
            className="lang-switch"
            role="group"
            aria-label={t(ui.langSwitchAria)}
          >
            {(["zh", "en"] as Locale[]).map((code) => (
              <button
                key={code}
                type="button"
                className={
                  locale === code ? "lang-switch-btn active" : "lang-switch-btn"
                }
                aria-pressed={locale === code}
                onClick={() => setLocale(code)}
              >
                {code === "zh" ? t(ui.langZh) : t(ui.langEn)}
              </button>
            ))}
          </div>
        </div>

        <p className="sidebar-label">{t(ui.docs)}</p>
        <nav className="sidebar-nav sidebar-nav-docs">
          <NavLink to="/" end className="sidebar-link">
            {t(ui.overview)}
          </NavLink>
          <NavLink to="/api" className="sidebar-link">
            <span className="sidebar-tag">{t(ui.apiNavTag)}</span>
            <span className="sidebar-title">{t(ui.apiNavTitle)}</span>
          </NavLink>
        </nav>
        <p className="sidebar-label">{t(ui.examples)}</p>
        <nav className="sidebar-nav">
          {EXAMPLES.map((ex) => (
            <NavLink key={ex.path} to={ex.path} className="sidebar-link">
              <span className="sidebar-tag">{ex.tag}</span>
              <span className="sidebar-title">{t(ex.title)}</span>
            </NavLink>
          ))}
        </nav>
        <a
          className="sidebar-repo"
          href="https://github.com/Gerywen/wave-spec"
          target="_blank"
          rel="noreferrer"
        >
          <svg
            className="sidebar-repo-icon"
            viewBox="0 0 16 16"
            width="16"
            height="16"
            aria-hidden
          >
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"
            />
          </svg>
          {t(ui.viewRepo)}
        </a>
      </aside>

      <div className="content">
        <Outlet />
      </div>
    </div>
  );
}
