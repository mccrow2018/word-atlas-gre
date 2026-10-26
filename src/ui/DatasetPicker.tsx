import { GRE_DATASETS } from "../atlas/gre";
import { stopAudio } from "../lib/audio";
import { go } from "../lib/router";
import { store, useStore, type Settings } from "../store/store";

export function DatasetPicker({
  privateAvailable = false,
}: {
  privateAvailable?: boolean;
}) {
  const selected = useStore((s) => s.settings.dataset);
  return (
    <label className="dataset-picker">
      <span>当前词库</span>
      <select
        aria-label="选择词库"
        value={selected}
        onChange={(e) => {
          stopAudio();
          store.settings({ dataset: e.target.value as Settings["dataset"] });
          go({ page: "today" }, null, true);
        }}
      >
        {GRE_DATASETS.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
        <option value="open">雅思 · 开放图鉴</option>
        {privateAvailable && <option value="private">私人 8000</option>}
      </select>
    </label>
  );
}
