import { Route, Routes } from "react-router-dom";
import { SiteShell } from "./components/SiteShell";
import { HomePage } from "./pages/HomePage";
import { ApiPage } from "./pages/ApiPage";
import { BasicExample } from "./pages/examples/BasicExample";
import { WaveformSpectrogramExample } from "./pages/examples/WaveformSpectrogramExample";
import { SelectionExample } from "./pages/examples/SelectionExample";
import { EditExample } from "./pages/examples/EditExample";
import { ExportExample } from "./pages/examples/ExportExample";
import { RateExample } from "./pages/examples/RateExample";
import { ChannelsExample } from "./pages/examples/ChannelsExample";
import { PlaySelectionExample } from "./pages/examples/PlaySelectionExample";
import { RecordExample } from "./pages/examples/RecordExample";

export function App() {
  return (
    <Routes>
      <Route element={<SiteShell />}>
        <Route index element={<HomePage />} />
        <Route path="api" element={<ApiPage />} />
        <Route path="examples/basic" element={<BasicExample />} />
        <Route
          path="examples/waveform-spectrogram"
          element={<WaveformSpectrogramExample />}
        />
        <Route path="examples/selection" element={<SelectionExample />} />
        <Route path="examples/edit" element={<EditExample />} />
        <Route path="examples/export" element={<ExportExample />} />
        <Route path="examples/rate" element={<RateExample />} />
        <Route path="examples/channels" element={<ChannelsExample />} />
        <Route
          path="examples/play-selection"
          element={<PlaySelectionExample />}
        />
        <Route path="examples/record" element={<RecordExample />} />
      </Route>
    </Routes>
  );
}
