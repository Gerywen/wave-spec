import { ExampleLayout } from "../../components/ExampleLayout";
import { useLocale } from "../../i18n/LocaleContext";
import { selectionExample } from "../../i18n/examplesContent";

export function SelectionExample() {
  const { locale, t } = useLocale();
  const page = selectionExample;
  return (
    <ExampleLayout
      title={t(page.title)}
      blurb={t(page.blurb)}
      source={page.source[locale]}
      tips={
        <ul>
          {page.tips.map((tip) => (
            <li key={tip.en}>{t(tip)}</li>
          ))}
        </ul>
      }
    />
  );
}
