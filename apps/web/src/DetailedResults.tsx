import type {
  CalculationResult,
  ValueProbability,
} from "@40k-calculator/calculator";
import type { ResolvedAbilityRules } from "./data/ability-rules";
import {
  buildAppliedRuleLabels,
  buildResultStageGroups,
  type ResultValueFormat,
} from "./data/result-view";

const MIN_VISIBLE_PROBABILITY = 0.00005;

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const decimal = (value: number): string => value.toFixed(2);
const modelLabel = (count: number): string => `${count} model${count === 1 ? "" : "s"}`;
const countLabel = (count: number, singular: string): string =>
  `${count} ${singular}${count === 1 ? "" : "s"}`;

function formatResultValue(value: number, format: ResultValueFormat): string {
  switch (format.kind) {
    case "count":
      return countLabel(value, format.singular);
    case "damage":
      return `${value} damage`;
    case "wounds":
      return `${value}W`;
    case "models":
      return modelLabel(value);
  }
}

interface ProbabilityBarsProps {
  rows: ValueProbability[];
  valueFormat: ResultValueFormat;
}

function ProbabilityBars({ rows, valueFormat }: ProbabilityBarsProps) {
  const visibleRows = rows.filter((row) => row.probability > MIN_VISIBLE_PROBABILITY);

  return (
    <div className="bars">
      {visibleRows.map((row) => {
        const label = formatResultValue(row.value, valueFormat);
        return (
          <div className="bar-row" key={row.value}>
            <span>{label}</span>
            <div
              className="bar-track"
              role="img"
              aria-label={`${label}: ${percent(row.probability)}`}
            >
              <div className="bar-fill" style={{ width: `${row.probability * 100}%` }} />
            </div>
            <strong>{percent(row.probability)}</strong>
          </div>
        );
      })}
    </div>
  );
}

interface ResultStageProps {
  title: string;
  average: number;
  averageSuffix?: string;
  rows: ValueProbability[];
  valueFormat: ResultValueFormat;
}

function ResultStage({
  title,
  average,
  averageSuffix = "",
  rows,
  valueFormat,
}: ResultStageProps) {
  return (
    <details className="result-stage">
      <summary>
        <span>{title}</span>
        <strong>{decimal(average)}{averageSuffix}</strong>
      </summary>
      <div className="stage-distribution">
        <p>Probability distribution</p>
        <ProbabilityBars rows={rows} valueFormat={valueFormat} />
      </div>
    </details>
  );
}

interface DetailedResultsProps {
  result: CalculationResult;
  rules: ResolvedAbilityRules;
}

export function DetailedResults({ result, rules }: DetailedResultsProps) {
  const mostLikely = result.summary.mostLikelyOutcome;
  const appliedRuleLabels = buildAppliedRuleLabels(rules);
  const stageGroups = buildResultStageGroups(result, rules);

  return (
    <section className="panel results" aria-live="polite">
      <h2>Calculation Results</h2>

      <div className="likely-result">
        <span>Most Likely Outcome</span>
        <strong>
          {mostLikely.unitDestroyed ? (
            "Defending unit destroyed"
          ) : (
            <>
              <span>{modelLabel(mostLikely.destroyedModels)} destroyed</span>
              <span>Next model has {mostLikely.currentModelRemainingWounds}W remaining</span>
            </>
          )}
        </strong>
        <div className="outcome-meta">
          <span>Exact outcome chance: {percent(mostLikely.probability)}</span>
          <span>Unit destroyed chance: {percent(result.summary.unitDestroyedProbability)}</span>
        </div>
      </div>

      <section className="applied-rules" aria-labelledby="applied-rules-title">
        <h3 id="applied-rules-title">Applied Rules</h3>
        <div className="rule-tags">
          {appliedRuleLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </section>

      <div className="result-groups">
        {stageGroups.map((group) => (
          <section className="result-group" key={group.key} aria-labelledby={`result-group-${group.key}`}>
            <h3 id={`result-group-${group.key}`}>{group.title}</h3>
            <div className="result-stages">
              {group.stages.map((stage) => (
                <ResultStage
                  key={stage.key}
                  title={stage.title}
                  average={stage.average}
                  averageSuffix={stage.averageSuffix}
                  rows={stage.rows}
                  valueFormat={stage.valueFormat}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
