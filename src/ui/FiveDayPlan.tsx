import { useAtlas } from "../atlas/context";
import { go } from "../lib/router";
import { fixedPlan } from "../store/plan";
import { dayKey, store, useStore } from "../store/store";

export function FiveDayPlan() {
  const atlas = useAtlas();
  const p = useStore((s) => s.progress);
  const plan = fixedPlan(atlas, p);
  if (!plan) return null;
  return (
    <section className="panel five-day-plan" aria-label="等价词 5 天计划">
      <div className="panel-head">
        <div>
          <p className="eyebrow">原书任务 · 5 DAY PLAN</p>
          <h2>五天，按原书一步步走。</h2>
        </div>
        <span className="chip">
          {plan.days.filter((d) => d.complete).length} / 5 天完成
        </span>
      </div>
      <p className="muted">
        每天的词条、等价关系和顺序与 PDF 一致。每轮最多 20
        个新词，可连续多轮完成当天全部任务；完成当日任务后，下一天最早于次日解锁。漏学会保留，不跳天。
      </p>
      <ol className="plan-days">
        {plan.days.map((d) => {
          const current = d.day === plan.current?.day;
          const status = d.complete
            ? "已完成"
            : current && plan.available
              ? "进行中"
              : current && !plan.started
                ? "待开始"
                : "待解锁";
          return (
            <li
              key={d.day}
              className={`${current ? "is-current" : ""} ${d.complete ? "is-complete" : ""}`}
            >
              <span className="eyebrow">DAY {d.day}</span>
              <b>{d.label}</b>
              <strong>
                {d.done}
                <small> / {d.ids.length} 条</small>
              </strong>
              <progress
                max={d.ids.length}
                value={d.done}
                aria-label={`${d.label}完成进度`}
              />
              <span>{status}</span>
              <button
                className="link"
                onClick={() =>
                  go({ page: "atlas", topic: `day-${d.day}`, view: "list" })
                }
              >
                查看词表
              </button>
            </li>
          );
        })}
      </ol>
      {!plan.started ? (
        <button
          className="btn btn-primary"
          onClick={() =>
            store.progress((prev) => ({ ...prev, planStarted: dayKey() }))
          }
        >
          从今天开始 5 天计划
        </button>
      ) : plan.complete ? (
        <p className="plan-message">五天任务全部完成。接下来按记忆曲线复习。</p>
      ) : !plan.available ? (
        <p className="plan-message">
          {plan.current?.label}
          尚未到解锁日期。今天可以复习已学词，或浏览原书词表。
        </p>
      ) : (
        <p className="plan-message">
          当前：{plan.current?.label}，还剩 {plan.fresh.length}{" "}
          条。开始下方今日旅程即可继续。
        </p>
      )}
      {p.planStarted && (
        <small className="muted">
          开始日期：{p.planStarted} · 按本设备日历计算 · 学习记录随词库单独保存
        </small>
      )}
    </section>
  );
}
