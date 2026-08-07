import { ExampleLayout } from "../../components/ExampleLayout";
import { useLocale } from "../../i18n/LocaleContext";
import { channelsExample } from "../../i18n/examplesContent";

export function ChannelsExample() {
  const { locale, t } = useLocale();
  const page = channelsExample;
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
