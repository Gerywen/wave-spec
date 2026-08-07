import { Link } from "react-router-dom";
import { EXAMPLES } from "../examples";
import { useLocale } from "../i18n/LocaleContext";
import { ui } from "../i18n/ui";

export function HomePage() {
  const { t } = useLocale();
  const first = EXAMPLES[0]!;
  const highlights = [
    { title: ui.homeHighlight1Title, body: ui.homeHighlight1Body },
    { title: ui.homeHighlight2Title, body: ui.homeHighlight2Body },
    { title: ui.homeHighlight3Title, body: ui.homeHighlight3Body },
  ] as const;

  return (
    <div className="home">
      <section className="home-hero" aria-labelledby="home-brand">
        <p className="home-kicker">{t(ui.homeKicker)}</p>
        <h1 id="home-brand" className="home-brand">
          playback-controls
        </h1>
        <p className="home-lead">{t(ui.homeLead)}</p>
        <div className="home-actions">
          <Link className="home-cta" to={first.path}>
            {t(ui.homeStart).replace("{title}", t(first.title))}
          </Link>
          <Link className="home-cta-secondary" to="/api">
            {t(ui.homeApi)}
          </Link>
          <a className="home-cta-secondary" href="#example-index">
            {t(ui.homeBrowse)}
          </a>
        </div>
      </section>

      <figure className="home-preview">
        <img
          src="/overview-preview.jpg"
          alt={t(ui.homePreviewAlt)}
          width={1200}
          height={560}
          decoding="async"
          fetchPriority="high"
        />
        <figcaption>{t(ui.homePreviewCaption)}</figcaption>
      </figure>

      <section className="home-highlights" aria-label={t(ui.howToTry)}>
        {highlights.map((item) => (
          <div key={item.title.en} className="home-highlight">
            <h2>{t(item.title)}</h2>
            <p>{t(item.body)}</p>
          </div>
        ))}
      </section>

      <section id="example-index" className="overview-list">
        <h2>{t(ui.homeIndexTitle)}</h2>
        <ol>
          {EXAMPLES.map((ex, i) => (
            <li key={ex.path}>
              <Link to={ex.path}>
                <strong>
                  {i + 1}. {t(ex.title)}
                </strong>
                <span>{t(ex.blurb)}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
