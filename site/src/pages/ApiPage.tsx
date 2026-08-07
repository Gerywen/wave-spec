import { Link } from "react-router-dom";
import { API_SECTIONS } from "../lib/apiDocs";
import { useLocale } from "../i18n/LocaleContext";
import { ui } from "../i18n/ui";

export function ApiPage() {
  const { t } = useLocale();

  return (
    <div className="api-page">
      <header className="api-intro">
        <p className="api-kicker">{t(ui.apiKicker)}</p>
        <h1>{t(ui.apiTitle)}</h1>
        <p className="api-lead">{t(ui.apiLead)}</p>
        <p className="api-lead">
          <Link to="/examples/basic">{t(ui.apiStartLink)}</Link>
        </p>
        <nav className="api-toc" aria-label={t(ui.apiToc)}>
          {API_SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {t(s.title)}
            </a>
          ))}
        </nav>
      </header>

      {API_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="api-section">
          <h2>{t(section.title)}</h2>
          {section.lead && (
            <p className="api-section-lead">{t(section.lead)}</p>
          )}

          {section.items && section.items.length > 0 && (
            <div className="api-table-wrap">
              <table className="api-table">
                <thead>
                  <tr>
                    <th>{t(ui.apiColName)}</th>
                    <th>{t(ui.apiColType)}</th>
                    <th>{t(ui.apiColDefault)}</th>
                    <th>{t(ui.apiColPurpose)}</th>
                    <th>{t(ui.apiColEffect)}</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
                    <tr key={item.name}>
                      <td>
                        <code>{item.name}</code>
                        {item.required && (
                          <span className="api-req" title={t(ui.apiRequired)}>
                            *
                          </span>
                        )}
                      </td>
                      <td>
                        <code className="api-type">{item.type}</code>
                      </td>
                      <td>
                        {item.defaultValue != null ? (
                          <code>{item.defaultValue}</code>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{t(item.purpose)}</td>
                      <td>{t(item.effect)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {section.methods?.map((method) => (
            <article key={method.signature} className="api-method">
              <pre className="api-sig">
                <code>{method.signature}</code>
              </pre>
              <p className="api-method-purpose">{t(method.purpose)}</p>
              {method.params.length > 0 && (
                <div className="api-table-wrap">
                  <table className="api-table">
                    <thead>
                      <tr>
                        <th>{t(ui.apiColParam)}</th>
                        <th>{t(ui.apiColType)}</th>
                        <th>{t(ui.apiColDefault)}</th>
                        <th>{t(ui.apiColPurpose)}</th>
                        <th>{t(ui.apiColEffect)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {method.params.map((p) => (
                        <tr key={p.name}>
                          <td>
                            <code>{p.name}</code>
                            {p.required && (
                              <span
                                className="api-req"
                                title={t(ui.apiRequired)}
                              >
                                *
                              </span>
                            )}
                          </td>
                          <td>
                            <code className="api-type">{p.type}</code>
                          </td>
                          <td>
                            {p.defaultValue != null ? (
                              <code>{p.defaultValue}</code>
                            ) : p.required ? (
                              t(ui.apiRequired)
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>{t(p.purpose)}</td>
                          <td>{t(p.effect)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {method.returns && (
                <p className="api-returns">
                  <strong>{t(ui.apiReturns)}</strong> {t(method.returns)}
                </p>
              )}
              {method.notes && method.notes.length > 0 && (
                <ul className="api-notes">
                  {method.notes.map((n) => (
                    <li key={n.en}>{t(n)}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
