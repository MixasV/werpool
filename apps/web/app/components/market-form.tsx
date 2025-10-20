"use client";

import { useEffect, useMemo, useState } from "react";

import type { CreateMarketPayload, MarketDetail } from "../lib/markets-api";

type WorkflowPayload = NonNullable<CreateMarketPayload["workflow"]>;

type OutcomeForm = {
  label: string;
  status: CreateMarketPayload["outcomes"][number]["status"];
  impliedProbability: number;
  liquidity: number;
};

type WorkflowForm = {
  type: WorkflowPayload[number]["type"];
  status: WorkflowPayload[number]["status"];
  description: string;
  triggersAt?: string;
};

const defaultOutcome = (): OutcomeForm => ({
  label: "Yes",
  status: "active",
  impliedProbability: 0.5,
  liquidity: 500,
});

const defaultWorkflow = (): WorkflowForm => ({
  type: "open",
  status: "pending",
  description: "Open market",
});

const toFloat = (value: string): number => {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const toInt = (value: string): number => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

interface MarketFormProps {
  action: (formData: FormData) => Promise<void>;
  marketId?: string;
  initial?: MarketDetail;
  submitLabel?: string;
}

export const MarketForm = ({
  action,
  marketId,
  initial,
  submitLabel = "Create market",
}: MarketFormProps) => {
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [state, setState] = useState<CreateMarketPayload["state"]>(
    initial?.state ?? "draft"
  );
  const [category, setCategory] = useState<CreateMarketPayload["category"]>(
    initial?.category ?? "crypto"
  );
  const [closeAt, setCloseAt] = useState(
    initial?.closeAt ? initial.closeAt.slice(0, 16) : ""
  );
  const [scheduledStartAt, setScheduledStartAt] = useState(
    initial?.schedule?.scheduledStartAt ? initial.schedule.scheduledStartAt.slice(0, 16) : ""
  );
  const [tradingLockAt, setTradingLockAt] = useState(
    initial?.schedule?.tradingLockAt ? initial.schedule.tradingLockAt.slice(0, 16) : ""
  );
  const [freezeWindowStartAt, setFreezeWindowStartAt] = useState(
    initial?.schedule?.freezeWindowStartAt
      ? initial.schedule.freezeWindowStartAt.slice(0, 16)
      : ""
  );
  const [freezeWindowEndAt, setFreezeWindowEndAt] = useState(
    initial?.schedule?.freezeWindowEndAt ? initial.schedule.freezeWindowEndAt.slice(0, 16) : ""
  );
  const [tagsInput, setTagsInput] = useState(
    initial?.tags && initial.tags.length > 0 ? initial.tags.join(", ") : ""
  );
  const [oracleId, setOracleId] = useState(initial?.oracleId ?? "");
  const [patrolThreshold, setPatrolThreshold] = useState(
    initial ? String(initial.patrolThreshold) : ""
  );
  const [tokenSymbol, setTokenSymbol] = useState(
    initial?.liquidityPool.tokenSymbol ?? "FLOW"
  );
  const [totalLiquidity, setTotalLiquidity] = useState(
    initial ? String(initial.liquidityPool.totalLiquidity) : "1000"
  );
  const [feeBps, setFeeBps] = useState(
    initial ? String(initial.liquidityPool.feeBps) : "50"
  );
  const [providerCount, setProviderCount] = useState(
    initial ? String(initial.liquidityPool.providerCount) : "1"
  );
  const [outcomes, setOutcomes] = useState<OutcomeForm[]>(
    initial
      ? initial.outcomes.map((outcome) => ({
          label: outcome.label,
          status: outcome.status,
          impliedProbability: outcome.impliedProbability,
          liquidity: outcome.liquidity,
        }))
      : [defaultOutcome(), { ...defaultOutcome(), label: "No" }]
  );
  const [workflow, setWorkflow] = useState<WorkflowForm[]>(
    initial
      ? initial.workflow.map((action) => ({
          type: action.type,
          status: action.status,
          description: action.description,
          triggersAt: action.triggersAt?.slice(0, 16),
        }))
      : [defaultWorkflow()]
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!initial) {
      return;
    }

    setSlug(initial.slug);
    setTitle(initial.title);
    setDescription(initial.description);
    setState(initial.state);
    setCategory(initial.category ?? "crypto");
    setCloseAt(initial.closeAt ? initial.closeAt.slice(0, 16) : "");
    setScheduledStartAt(
      initial.schedule?.scheduledStartAt
        ? initial.schedule.scheduledStartAt.slice(0, 16)
        : ""
    );
    setTradingLockAt(
      initial.schedule?.tradingLockAt ? initial.schedule.tradingLockAt.slice(0, 16) : ""
    );
    setFreezeWindowStartAt(
      initial.schedule?.freezeWindowStartAt
        ? initial.schedule.freezeWindowStartAt.slice(0, 16)
        : ""
    );
    setFreezeWindowEndAt(
      initial.schedule?.freezeWindowEndAt
        ? initial.schedule.freezeWindowEndAt.slice(0, 16)
        : ""
    );
    setTagsInput(initial.tags.length > 0 ? initial.tags.join(", ") : "");
    setOracleId(initial.oracleId ?? "");
    setPatrolThreshold(String(initial.patrolThreshold));
    setTokenSymbol(initial.liquidityPool.tokenSymbol);
    setTotalLiquidity(String(initial.liquidityPool.totalLiquidity));
    setFeeBps(String(initial.liquidityPool.feeBps));
    setProviderCount(String(initial.liquidityPool.providerCount));
    setOutcomes(
      initial.outcomes.map((outcome) => ({
        label: outcome.label,
        status: outcome.status,
        impliedProbability: outcome.impliedProbability,
        liquidity: outcome.liquidity,
      }))
    );
    setWorkflow(
      initial.workflow.map((action) => ({
        type: action.type,
        status: action.status,
        description: action.description,
        triggersAt: action.triggersAt?.slice(0, 16),
      }))
    );
  }, [initial]);

  const totalProbability = useMemo(
    () => outcomes.reduce((acc, outcome) => acc + outcome.impliedProbability, 0),
    [outcomes]
  );

  const handleOutcomeChange = (index: number, patch: Partial<OutcomeForm>) => {
    setOutcomes((prev) =>
      prev.map((outcome, idx) => (idx === index ? { ...outcome, ...patch } : outcome))
    );
  };

  const handleWorkflowChange = (index: number, patch: Partial<WorkflowForm>) => {
    setWorkflow((prev) =>
      prev.map((action, idx) => (idx === index ? { ...action, ...patch } : action))
    );
  };

  const removeOutcome = (index: number) => {
    setOutcomes((prev) => prev.filter((_, idx) => idx !== index));
  };

  const addOutcome = () => {
    setOutcomes((prev) => [...prev, defaultOutcome()]);
  };

  const addWorkflow = () => {
    setWorkflow((prev) => [...prev, defaultWorkflow()]);
  };

  const removeWorkflow = (index: number) => {
    setWorkflow((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (formData: FormData) => {
    try {
      setSubmitting(true);
      setError(null);

      if (!slug.trim()) {
        throw new Error("Slug is required");
      }

      if (!title.trim()) {
        throw new Error("Title is required");
      }

      if (outcomes.length < 2) {
        throw new Error("At least two outcomes are required");
      }

      const tags = tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);

      const schedule =
        scheduledStartAt || tradingLockAt || freezeWindowStartAt || freezeWindowEndAt
          ? {
              scheduledStartAt: scheduledStartAt
                ? new Date(scheduledStartAt).toISOString()
                : undefined,
              tradingLockAt: tradingLockAt
                ? new Date(tradingLockAt).toISOString()
                : undefined,
              freezeWindowStartAt: freezeWindowStartAt
                ? new Date(freezeWindowStartAt).toISOString()
                : undefined,
              freezeWindowEndAt: freezeWindowEndAt
                ? new Date(freezeWindowEndAt).toISOString()
                : undefined,
            }
          : undefined;

      const patrolThresholdValue = patrolThreshold.trim().length
        ? Number(patrolThreshold)
        : undefined;

      if (patrolThresholdValue !== undefined && Number.isNaN(patrolThresholdValue)) {
        throw new Error("Patrol threshold must be a number");
      }

      const payload: CreateMarketPayload = {
        slug,
        title,
        description,
        state,
        category,
        tags,
        oracleId: oracleId.trim() ? oracleId.trim() : undefined,
        patrolThreshold: patrolThresholdValue,
        closeAt: closeAt ? new Date(closeAt).toISOString() : undefined,
        schedule,
        liquidityPool: {
          tokenSymbol,
          totalLiquidity: toFloat(totalLiquidity),
          feeBps: toInt(feeBps),
          providerCount: toInt(providerCount),
        },
        outcomes: outcomes.map((outcome) => ({
          label: outcome.label,
          status: outcome.status,
          impliedProbability: outcome.impliedProbability,
          liquidity: outcome.liquidity,
        })),
        workflow: workflow.map((action) => ({
          type: action.type,
          status: action.status,
          description: action.description,
          triggersAt: action.triggersAt ? new Date(action.triggersAt).toISOString() : undefined,
        })),
      };

      formData.set("payload", JSON.stringify(payload));
      if (marketId) {
        formData.set("marketId", marketId);
      }
      await action(formData);
    } catch (submitError) {
      console.error(submitError);
      setError(submitError instanceof Error ? submitError.message : "Failed to save market");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="market-form" action={handleSubmit}>
      <section className="market-form__fieldset">
        <h2>Core information</h2>
        <label>
          <span>Slug</span>
          <input value={slug} onChange={(event) => setSlug(event.target.value)} required />
        </label>
        <label>
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          <span>Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
          />
        </label>
        <label>
          <span>Category</span>
          <select
            value={category ?? "crypto"}
            onChange={(event) =>
              setCategory(event.target.value as CreateMarketPayload["category"])
            }
          >
            <option value="crypto">Crypto</option>
            <option value="sports">Sports</option>
            <option value="esports">Esports</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={state} onChange={(event) => setState(event.target.value as typeof state)}>
            <option value="draft">Draft</option>
            <option value="live">Live</option>
            <option value="suspended">Paused</option>
            <option value="closed">Closed</option>
            <option value="settled">Settled</option>
            <option value="voided">Voided</option>
          </select>
        </label>
        <label>
          <span>Scheduled close</span>
          <input
            type="datetime-local"
            value={closeAt}
            onChange={(event) => setCloseAt(event.target.value)}
          />
        </label>
        <label>
          <span>Launch</span>
          <input
            type="datetime-local"
            value={scheduledStartAt}
            onChange={(event) => setScheduledStartAt(event.target.value)}
          />
        </label>
        <label>
          <span>Trading lock</span>
          <input
            type="datetime-local"
            value={tradingLockAt}
            onChange={(event) => setTradingLockAt(event.target.value)}
          />
        </label>
        <label>
          <span>Freeze window start</span>
          <input
            type="datetime-local"
            value={freezeWindowStartAt}
            onChange={(event) => setFreezeWindowStartAt(event.target.value)}
          />
        </label>
        <label>
          <span>Freeze window end</span>
          <input
            type="datetime-local"
            value={freezeWindowEndAt}
            onChange={(event) => setFreezeWindowEndAt(event.target.value)}
          />
        </label>
        <label>
          <span>Patrol threshold</span>
          <input
            type="number"
            step="0.01"
            value={patrolThreshold}
            onChange={(event) => setPatrolThreshold(event.target.value)}
          />
        </label>
        <label>
          <span>Oracle ID</span>
          <input value={oracleId} onChange={(event) => setOracleId(event.target.value)} />
        </label>
        <label>
          <span>Tags (comma separated)</span>
          <input value={tagsInput} onChange={(event) => setTagsInput(event.target.value)} />
        </label>
      </section>

      <section className="market-form__fieldset">
        <h2>Liquidity Pool</h2>
        <div className="market-form__grid">
          <label>
            <span>Token</span>
            <input value={tokenSymbol} onChange={(event) => setTokenSymbol(event.target.value)} />
          </label>
          <label>
            <span>Liquidity</span>
            <input
              type="number"
              step="0.01"
              value={totalLiquidity}
              onChange={(event) => setTotalLiquidity(event.target.value)}
            />
          </label>
          <label>
            <span>Fee (bps)</span>
            <input
              type="number"
              value={feeBps}
              onChange={(event) => setFeeBps(event.target.value)}
            />
          </label>
          <label>
            <span>Providers</span>
            <input
              type="number"
              value={providerCount}
              onChange={(event) => setProviderCount(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="market-form__fieldset market-form__fieldset--outcomes">
        <div className="market-form__fieldset-header">
          <h2>Outcomes</h2>
          <button type="button" className="button tertiary" onClick={addOutcome}>
            Add outcome
          </button>
        </div>
        <p className="market-form__hint">Probability sum: {totalProbability.toFixed(2)}</p>
        <div className="market-form__list">
          {outcomes.map((outcome, index) => (
            <div key={`${outcome.label}-${index}`} className="market-form__card">
              <div className="market-form__card-header">
                <h3>Outcome #{index + 1}</h3>
                {outcomes.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOutcome(index)}
                    className="link-button"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="market-form__grid">
                <label>
                  <span>Title</span>
                  <input
                    value={outcome.label}
                    onChange={(event) => handleOutcomeChange(index, { label: event.target.value })}
                  />
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={outcome.status ?? "active"}
                    onChange={(event) =>
                      handleOutcomeChange(index, {
                        status: event.target.value as OutcomeForm["status"],
                      })
                    }
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Paused</option>
                    <option value="settled">Settled</option>
                  </select>
                </label>
                <label>
                  <span>Probability</span>
                  <input
                    type="number"
                    step="0.01"
                    value={outcome.impliedProbability}
                    onChange={(event) =>
                      handleOutcomeChange(index, {
                        impliedProbability: toFloat(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>Liquidity</span>
                  <input
                    type="number"
                    step="0.01"
                    value={outcome.liquidity}
                    onChange={(event) =>
                      handleOutcomeChange(index, { liquidity: toFloat(event.target.value) })
                    }
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="market-form__fieldset market-form__fieldset--workflow">
        <div className="market-form__fieldset-header">
          <h2>Workflow</h2>
          <button type="button" className="button tertiary" onClick={addWorkflow}>
            Add step
          </button>
        </div>
        <div className="market-form__list">
          {workflow.map((action, index) => (
            <div key={`${action.type}-${index}`} className="market-form__card">
              <div className="market-form__card-header">
                <h3>Step #{index + 1}</h3>
                {workflow.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeWorkflow(index)}
                    className="link-button"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="market-form__grid">
                <label>
                  <span>Type</span>
                  <select
                    value={action.type}
                    onChange={(event) =>
                      handleWorkflowChange(index, {
                        type: event.target.value as WorkflowForm["type"],
                      })
                    }
                  >
                    <option value="open">Open</option>
                    <option value="suspend">Suspend</option>
                    <option value="settle">Settle</option>
                    <option value="void">Void</option>
                    <option value="distribute">Distribute</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                <label>
                  <span>Description</span>
                  <input
                    value={action.description}
                    onChange={(event) =>
                      handleWorkflowChange(index, { description: event.target.value })
                    }
                  />
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={action.status ?? "pending"}
                    onChange={(event) =>
                      handleWorkflowChange(index, {
                        status: event.target.value as WorkflowForm["status"],
                      })
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="executed">Executed</option>
                    <option value="failed">Failed</option>
                  </select>
                </label>
                <label>
                  <span>When</span>
                  <input
                    type="datetime-local"
                    value={action.triggersAt ?? ""}
                    onChange={(event) =>
                      handleWorkflowChange(index, { triggersAt: event.target.value || undefined })
                    }
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && <p className="market-form__error">{error}</p>}

      <div className="market-form__actions">
        <button type="submit" className="button primary" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
};
