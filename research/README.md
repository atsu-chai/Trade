# Strategy Research

`vendor/autoresearch` は LLM の学習コードを自動改良するための参照用です。このプロジェクトでは同じ発想を株価評価に移し、2015年以降の日足を使って戦略パラメータを探索します。

## 何をするか

- Yahoo Finance から 2015年以降の日足を取得
- 2023年末までを学習側、2024年以降を検証側として分割
- 複数の戦略パラメータを試す
- 検証成績が現行設定を上回った場合だけ `config/strategy-config.ts` を更新
- 結果を `data/research/latest-report.json` に保存

## 実行

```bash
cd /Users/ooshitaatsushinin/program/trade
node research/optimize-strategy.mjs
```

対象銘柄数と候補数を絞る場合:

```bash
RESEARCH_UNIVERSE_SIZE=12 RESEARCH_CANDIDATES=30 node research/optimize-strategy.mjs
```

## 出力

- 採用設定: `config/strategy-config.ts`
- 最新レポート: `data/research/latest-report.json`

## 補足

現在この探索結果は、少なくともバックテスト側で共通設定として使われます。ライブの短期シグナルは別ロジックなので、そこへ繋ぐ場合は別途検証してから反映してください。
