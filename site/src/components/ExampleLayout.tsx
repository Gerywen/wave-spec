import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { EXAMPLES } from "../examples";
import { useLocale } from "../i18n/LocaleContext";
import { ui } from "../i18n/ui";
import { LivePlayground } from "./LivePlayground";

type Props = {
  title: string;
  blurb: string;
  source: string;
  tips?: ReactNode;
};

export function ExampleLayout({ title, blurb, source, tips }: Props) {
  const { pathname } = useLocation();
  const { locale, t } = useLocale();
  const idx = EXAMPLES.findIndex((e) => e.path === pathname);
  const prev = idx > 0 ? EXAMPLES[idx - 1] : null;
  const next = idx >= 0 && idx < EXAMPLES.length - 1 ? EXAMPLES[idx + 1] : null;

  return (
    <div className="example-page">
      <div className="example-intro">
        <h1>{title}</h1>
        <p>{blurb}</p>
      </div>

      <LivePlayground key={`${pathname}-${locale}`} initialSource={source} />

      {tips && (
        <div className="example-aside">
          <section>
            <h2>{t(ui.howToTry)}</h2>
            <div className="tips">{tips}</div>
          </section>
        </div>
      )}

      <footer className="example-pager">
        {prev ? <Link to={prev.path}>← {t(prev.title)}</Link> : <span />}
        {next ? <Link to={next.path}>{t(next.title)} →</Link> : <span />}
      </footer>
    </div>
  );
}
