"use client";

import { useEffect, useMemo, useState } from "react";
import { upsertStock } from "@/app/actions";
import { STOCK_MASTER } from "@/lib/stock-master";

type Stock = {
  id?: number;
  code?: string;
  name?: string;
  tags?: string;
  memo?: string;
  watch_status?: string;
  target_amount?: number;
  is_holding?: boolean;
  holding_price?: number | null;
  holding_shares?: number | null;
  allow_additional_buy?: boolean;
};

export function StockForm({ stock }: { stock?: Stock }) {
  const [code, setCode] = useState(stock?.code ?? "");
  const [name, setName] = useState(stock?.name ?? "");
  const [tags, setTags] = useState(stock?.tags ?? "");
  const candidates = useMemo(() => {
    const query = code.trim().toLowerCase();
    if (!query) return STOCK_MASTER.slice(0, 12);
    return STOCK_MASTER.filter(
      (item) => item.code.startsWith(query) || item.name.toLowerCase().includes(query) || item.tags.toLowerCase().includes(query),
    ).slice(0, 12);
  }, [code]);

  useEffect(() => {
    const exact = STOCK_MASTER.find((item) => item.code === code.trim());
    if (!exact) return;
    setName(exact.name);
    setTags(exact.tags);
  }, [code]);

  function applyCandidate(candidateCode: string) {
    const candidate = STOCK_MASTER.find((item) => item.code === candidateCode);
    if (!candidate) return;
    setCode(candidate.code);
    setName(candidate.name);
    setTags(candidate.tags);
  }

  return (
    <form action={upsertStock}>
      <input type="hidden" name="id" value={stock?.id ?? ""} />
      <div className="form-row">
        <label>
          銘柄コード
          <input
            name="code"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="7203"
            inputMode="numeric"
            list="stock-code-options"
          />
        </label>
        <label>
          銘柄名
          <input name="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="トヨタ自動車" />
        </label>
      </div>
      <datalist id="stock-code-options">
        {candidates.map((candidate) => (
          <option key={candidate.code} value={candidate.code}>
            {candidate.name}
          </option>
        ))}
      </datalist>
      {candidates.length ? (
        <div className="candidate-list" aria-label="銘柄候補">
          {candidates.map((candidate) => (
            <button className="candidate-chip" key={candidate.code} type="button" onClick={() => applyCandidate(candidate.code)}>
              <span>{candidate.code}</span>
              <strong>{candidate.name}</strong>
            </button>
          ))}
        </div>
      ) : null}
      <p className="muted form-help">候補を選ぶと、銘柄名とタグを自動入力します。</p>
      <div className="form-row">
        <label>
          タグ
          <input name="tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="大型株,AI関連" />
        </label>
        <label>
          監視状態
          <select name="watch_status" defaultValue={stock?.watch_status ?? "normal"}>
            <option value="normal">通常監視</option>
            <option value="strong">強監視</option>
            <option value="stopped">停止</option>
          </select>
        </label>
      </div>
      <label>
        メモ
        <textarea name="memo" rows={3} defaultValue={stock?.memo ?? ""} />
      </label>
      <div className="form-row">
        <label>
          想定購入金額
          <input name="target_amount" type="number" defaultValue={stock?.target_amount ?? 100000} />
        </label>
        <label>
          保有単価
          <input name="holding_price" type="number" step="0.01" defaultValue={stock?.holding_price ?? ""} />
        </label>
        <label>
          保有株数
          <input name="holding_shares" type="number" defaultValue={stock?.holding_shares ?? ""} />
        </label>
      </div>
      <div className="actions">
        <label>
          <input name="is_holding" type="checkbox" defaultChecked={stock?.is_holding ?? false} /> 保有中
        </label>
        <label>
          <input name="allow_additional_buy" type="checkbox" defaultChecked={stock?.allow_additional_buy ?? false} />{" "}
          買い増し候補を出す
        </label>
      </div>
      <button type="submit">保存</button>
    </form>
  );
}
