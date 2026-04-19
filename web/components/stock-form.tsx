import { upsertStock } from "@/app/actions";

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
  return (
    <form action={upsertStock}>
      <input type="hidden" name="id" value={stock?.id ?? ""} />
      <div className="form-row">
        <label>
          銘柄コード
          <input name="code" required defaultValue={stock?.code ?? ""} placeholder="7203" />
        </label>
        <label>
          銘柄名
          <input name="name" required defaultValue={stock?.name ?? ""} placeholder="トヨタ自動車" />
        </label>
      </div>
      <div className="form-row">
        <label>
          タグ
          <input name="tags" defaultValue={stock?.tags ?? ""} placeholder="大型株,AI関連" />
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

