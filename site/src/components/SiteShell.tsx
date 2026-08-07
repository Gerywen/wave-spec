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
          href="https://gitee.com/lantuyuntuo/playback-controls"
          target="_blank"
          rel="noreferrer"
        >
          {t(ui.viewRepo)}
        </a>
      </aside>

      <div className="content">
        <Outlet />
      </div>
    </div>
  );
}
