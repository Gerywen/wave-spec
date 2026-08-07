import { ExampleLayout } from "../../components/ExampleLayout";
import { useLocale } from "../../i18n/LocaleContext";
import { playSelectionExample } from "../../i18n/examplesContent";

export function PlaySelectionExample() {
  const { locale, t } = useLocale();
  const page = playSelectionExample;
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
