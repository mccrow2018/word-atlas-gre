import { useAtlas } from "../atlas/context";
import { go } from "../lib/router";
import { useStore } from "../store/store";

export function AlignedCorePlan() {
  const atlas = useAtlas();
  const cards = useStore((s) => s.progress.cards);
  if (!atlas.learning) return null;
  return (
    <section
      className="panel aligned-core-plan"
      aria-label="机经词与等价词对齐计划"
    >
      <p className="eyebrow">配合等价词 · 每天 200 个新词</p>
      <h2>同一天，把相近的词一起记。</h2>
      <p className="muted">
        前 5
        个学习日跟随等价词的固定计划：先放同一个主词条，再补入资料中有关联的词。第
        6 天起补充剩余机经词，最后一天 50 个。
      </p>
      <div className="alignment-table-wrap">
        <table className="alignment-table">
          <thead>
            <tr>
              <th>学习日</th>
              <th>新词</th>
              <th>同日重合</th>
              <th>关联词</th>
              <th>已学</th>
              <th>词表</th>
            </tr>
          </thead>
          <tbody>
            {atlas.learning.days.map((d) => (
              <tr key={d.day}>
                <th scope="row">第 {d.day} 天</th>
                <td>{d.ids.length}</td>
                <td>{d.exact || "—"}</td>
                <td>{d.related || "—"}</td>
                <td>
                  {d.ids.filter((id) => !!cards[id]).length} / {d.ids.length}
                </td>
                <td>
                  <button
                    className="link"
                    onClick={() =>
                      go({
                        page: "atlas",
                        studyDay: String(d.day),
                        view: "list",
                      })
                    }
                  >
                    查看
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        关联依据为原资料的等价关系、共同等价词或相同中文释义，须结合语境理解。请与等价词从同一天起同步学习；已学词会跳过，并按新顺序补足每日
        200 个，已有记录不清空。
      </p>
    </section>
  );
}
