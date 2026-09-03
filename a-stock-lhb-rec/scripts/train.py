# -*- coding: utf-8 -*-
"""训练 T+3 模型 + 版本化 + 进化轨迹
读取 RUNTIME/data/model_data_t3.csv(有标签样本)
评估: 随机分层(参考) + 时间外(按日期 80/20 切分, 测试集均为已可知标签的前瞻样本)
自我进化: 新模型与「当前模型」在【同一时间外测试集】上比较 AUC,
          不劣(-0.01 容差)则接受并版本+1, 否则保留旧模型 —— 避免跨测试集不可比导致的误判。
写入: RUNTIME/model/model_t3.joblib + model_meta_t3.json + RUNTIME/model_history.json
"""
import os, json, joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split, StratifiedKFold
import _common as C

NUM = ["CHANGE_RATE", "TURNOVERRATE", "LOG_CAP", "NET_YI", "IS_LIMIT_UP", "PRE3_RET",
       "BUYER_TOP_SCORE", "BUYER_MEAN_SCORE", "BUYER_COUNT", "NET_BUY_RATIO",
       "RETAIL_RATIO", "HAS_INST", "HAS_HK", "FAMOUS_YZ", "THEME_MAIN",
       "THEME_STRENGTH", "MARKET_ZT", "LOW_XI", "LB_FLAG",
       "SELLER_TOP_SCORE", "SELLER_MEAN_SCORE"]
CAT = "REASON"

# 最小样本/正例门槛(过少则仅提示, 不硬阻断, 保证首次 init 可运行)
MIN_LABELED = 100
MIN_POS = 20
C_GRID = [0.1, 0.5, 1.0, 5.0, 10.0]
ACCEPT_TOL = 0.01  # 时间外(同一测试集) AUC 允许 1% 退化容差
WF_TOL = 0.03      # walk-forward AUC 允许 3% 退化容差(WF 噪声更大, 容差放宽)
OVERFIT_GAP = 0.10 # 随机AUC - 时间外AUC 超过此值视为过拟合风险
TIME_DECAY_HALFLIFE = 30  # 交易日军半衰期: 距最新交易日 30 个交易日的样本权重衰减至 0.5
REALIZED_WINDOW = 5       # 真实结果回馈统计窗口(最近 N 个已验证推荐日)


def load_labeled():
    if not os.path.exists(C.DATASET_CSV):
        print("[train] 无 dataset"); raise SystemExit(0)
    df = pd.read_csv(C.DATASET_CSV)
    df = df.dropna(subset=["T3_ZT"]).reset_index(drop=True)
    return df


def temporal_split(df, q=0.8):
    """按日期 80/20 切分, 返回 (train, test) 均为已标签样本"""
    ds = sorted(df["TRADE_DATE"].unique())
    cut = ds[max(1, int(len(ds) * q) - 1)]
    tr = df[df["TRADE_DATE"] < cut]
    te = df[df["TRADE_DATE"] >= cut]
    return tr, te


def _feat_cols(d):
    return NUM + [c for c in d.columns if c.startswith(CAT + "_")]


def _time_weights(df, halflife=TIME_DECAY_HALFLIFE):
    """按交易日位置指数衰减的样本权重: 最新交易日权重 1, 每过 halflife 个交易日减半。
    使模型拟合更贴近近期市场环境(情绪周期切换), 而非把 3 个月前的老样本与近端等权。"""
    ds = sorted(df["TRADE_DATE"].unique())
    if len(ds) <= 1:
        return np.ones(len(df))
    idx = {d: i for i, d in enumerate(ds)}
    pos = df["TRADE_DATE"].map(idx).values.astype(float)
    newest = len(ds) - 1
    return np.exp(-np.log(2) * (newest - pos) / max(1, halflife))


def realized_summary(window=REALIZED_WINDOW):
    """真实 T+3 结果回馈: 汇总最近 window 个已验证推荐日的实际命中率(按推荐数加权)。
    返回 dict, 无验证历史则 None。这是进化轨迹里唯一的「真实世界」指标(区别于样本内AUC)。"""
    if not os.path.exists(C.VERIFY_PATH):
        return None
    try:
        v = pd.read_csv(C.VERIFY_PATH)
    except Exception:
        return None
    v = v.copy()
    keep = [c for c in ("DATE", "推荐数", "T1命中率", "T3命中率") if c in v.columns]
    if not keep or len(v) == 0:
        return None
    v = v[keep].sort_values("DATE").tail(window)
    n = int(v["推荐数"].sum()) if "推荐数" in v.columns else 0
    if n <= 0:
        return None
    def _wavg(col):
        if col not in v.columns:
            return None
        return round(float((v[col] * v["推荐数"]).sum() / n), 1)
    return {"days": int(len(v)), "n": int(n),
            "t1_hit": _wavg("T1命中率"), "t3_hit": _wavg("T3命中率")}


def pick_C(X, y, sample_weight=None):
    """在训练集内部分层 5 折 CV 选正则化强度 C(不用测试集选超参, 避免泄漏)。sample_weight 与训练一致(时间衰减)。"""
    y = np.asarray(y, dtype=int)
    if len(np.unique(y)) < 2 or len(y) < 40:
        return 1.0
    best_c, best = 1.0, -1.0
    for c in C_GRID:
        scores = []
        try:
            skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
            for ti, vi in skf.split(X, y):
                m = LogisticRegression(class_weight="balanced", max_iter=3000, C=c, random_state=42)
                m.fit(X[ti], y[ti],
                      sample_weight=(sample_weight[ti] if sample_weight is not None else None))
                p = m.predict_proba(X[vi])[:, 1]
                scores.append(roc_auc_score(y[vi], p))
        except Exception:
            continue
        if scores:
            mu = float(np.mean(scores))
            if mu > best:
                best, best_c = mu, c
    return best_c


def evaluate(tr, te, C_=1.0):
    feats = _feat_cols(tr)
    Xtr = tr[feats].fillna(0).values
    w = _time_weights(tr)
    scl = StandardScaler().fit(Xtr)
    m = LogisticRegression(class_weight="balanced", max_iter=3000, C=C_, random_state=42)
    m.fit(scl.transform(Xtr), tr["T3_ZT"].values.astype(int), sample_weight=w)
    Xte = te[feats].fillna(0).values
    p = m.predict_proba(scl.transform(Xte))[:, 1]
    auc = roc_auc_score(te["T3_ZT"].values.astype(int), p)
    te_s = te.copy(); te_s["P"] = p; te_s = te_s.sort_values("P", ascending=False)
    top = {f"top{n}": round(float(te_s.head(n)["T3_ZT"].mean()) * 100, 1) for n in [10, 20, 30, 50]}
    base = round(float(te_s["T3_ZT"].mean()) * 100, 1)
    return m, scl, feats, auc, top, base, te_s


def walk_forward(df, n_folds=1, C_=1.0):
    """滚动时间外评估: 从最早样本出发, 每次前推一段做 test 并统计 AUC/TopN, 返回均值。
    相比单次 80/20: 覆盖更多时段、结果更稳健, 是自进化门控更可信的基准。
    返回 (fold_list, 汇总徽标); n_folds=1 退化为单次尾部切分(与旧口径可比)。"""
    ds = sorted(df["TRADE_DATE"].unique())
    if len(ds) < 6:
        return None, None
    n_folds = max(1, min(n_folds, len(ds)))
    span = max(1, (len(ds) - 3) // n_folds)   # 每个 fold 的 test 天数
    folds = []
    # 尽量让每个 fold 测试集都有正负例, 不足则跳过该 fold
    for i in range(n_folds):
        cut0 = 2 + i * span                      # 至少 2 天作 train 底
        cut1 = cut0 + span
        tr_dates = ds[:cut0]
        te_dates = ds[cut0:min(cut1, len(ds))]
        if len(te_dates) < 1:
            continue
        tr = df[df["TRADE_DATE"] < te_dates[0]]
        te = df[df["TRADE_DATE"].isin(te_dates)]
        if len(tr) < MIN_LABELED or len(te["T3_ZT"].unique()) < 2:
            continue
        feats = _feat_cols(tr)
        scl = StandardScaler().fit(tr[feats].fillna(0).values)
        w = _time_weights(tr)
        m = LogisticRegression(class_weight="balanced", max_iter=3000, C=C_, random_state=42)
        m.fit(scl.transform(tr[feats].fillna(0).values), tr["T3_ZT"].values.astype(int), sample_weight=w)
        p = m.predict_proba(scl.transform(te[feats].fillna(0).values))[:, 1]
        te_s = te.copy(); te_s["P"] = p; te_s = te_s.sort_values("P", ascending=False)
        top = {f"top{n}": round(float(te_s.head(n)["T3_ZT"].mean()) * 100, 1) for n in [10, 20]}
        folds.append({"test_dates": [te_dates[0], te_dates[-1]], "n_test": len(te),
                      "auc": roc_auc_score(te["T3_ZT"].values.astype(int), p),
                      **top})
    if not folds:
        return None, None
    agg = {"auc_wf": round(float(np.mean([f["auc"] for f in folds])), 3),
           "top20_wf": round(float(np.mean([f["top20"] for f in folds])), 1),
           "n_folds": len(folds)}
    return folds, agg


def _auc_on(art, te):
    """工件(全量模型)在给定测试集上的 AUC(同协议比较用)；异常返回 None"""
    if art is None:
        return None
    try:
        Xte = C.prep_features(te, art)
        p = art["model"].predict_proba(art["scaler"].transform(Xte.values))[:, 1]
        return round(float(roc_auc_score(te["T3_ZT"].values.astype(int), p)), 4)
    except Exception:
        return None


def train_full(df, C_=1.0, prefer_gb=None):
    """训练全量生产模型。prefer_gb=None 时按时间外 AUC 自动择优：LR vs GBDT 谁在
    时间外测试集 AUC 更高就用谁（GB 在样本充足时通常更准，样本稀疏时 LR 更稳）。
    返回 (model, scaler, feats, coef_or_None, n, pos_rate, wsum, model_kind)"""
    d = pd.get_dummies(df, columns=[CAT])
    feats = _feat_cols(d)
    X = d[feats].fillna(0).values; y = d["T3_ZT"].values.astype(int)
    w = _time_weights(df)
    sc = StandardScaler().fit(X)
    m = LogisticRegression(class_weight="balanced", max_iter=3000, C=C_, random_state=42)
    m.fit(sc.transform(X), y, sample_weight=w)
    coef = pd.DataFrame({"feature": feats, "coef": m.coef_[0], "odds": np.exp(m.coef_[0])}).sort_values("coef", ascending=False)
    return m, sc, feats, coef, len(d), float(y.mean()), float(w.sum()), "lr"


def _gb_auc_on(tr, te, feats, C_=1.0):
    """GBDT 在时间外测试集上的 AUC（用于与 LR 择优）。样本不足返回 None。"""
    try:
        sc = StandardScaler().fit(tr[feats].fillna(0).values)
        gb = GradientBoostingClassifier(random_state=42)
        gb.fit(sc.transform(tr[feats].fillna(0).values), tr["T3_ZT"].values.astype(int),
               sample_weight=_time_weights(tr))
        p = gb.predict_proba(sc.transform(te[feats].fillna(0).values))[:, 1]
        return round(float(roc_auc_score(te["T3_ZT"].values.astype(int), p)), 4)
    except Exception:
        return None


def main(force=False):
    df = load_labeled()
    n_pos = int(df["T3_ZT"].sum())
    print(f"[train] 有标签样本 {len(df)}  正例 {n_pos} ({df['T3_ZT'].mean()*100:.1f}%)")
    if len(df) < MIN_LABELED or n_pos < MIN_POS:
        print(f"[train] 警告: 样本量偏少(样本={len(df)}, 正例={n_pos}), AUC/门控噪声较大, 建议积累更多交易日数据")

    # 随机拆分(参考)
    d_all = pd.get_dummies(df, columns=[CAT])
    feats_all = _feat_cols(d_all)
    Xa = d_all[feats_all].fillna(0).values; ya = d_all["T3_ZT"].values.astype(int)
    Xtr0, Xte0, ytr0, yte0 = train_test_split(Xa, ya, test_size=0.3, random_state=42, stratify=ya)
    sc0 = StandardScaler().fit(Xtr0)
    m0 = LogisticRegression(class_weight="balanced", max_iter=3000, C=1.0).fit(sc0.transform(Xtr0), ytr0)
    auc_random = round(float(roc_auc_score(yte0, m0.predict_proba(sc0.transform(Xte0))[:, 1])), 3)

    # 时间外
    tr, te = temporal_split(df)
    if len(tr) == 0 or len(te) == 0 or len(te["T3_ZT"].unique()) < 2:
        print("[train] 时间外切分无有效测试集(AUC 不可算), 中止训练"); return None
    best_c = pick_C(tr[_feat_cols(tr)].fillna(0).values, tr["T3_ZT"].values.astype(int),
                    sample_weight=_time_weights(tr))
    m_te, sc_te, feats_te, auc_temporal, top, base, te_sorted = evaluate(tr, te, best_c)
    # GB 对照
    gb = GradientBoostingClassifier(random_state=42).fit(
        sc_te.transform(tr[feats_te].fillna(0).values), tr["T3_ZT"].values.astype(int),
        sample_weight=_time_weights(tr))
    auc_gb = round(float(roc_auc_score(te["T3_ZT"].values.astype(int),
                      gb.predict_proba(sc_te.transform(te[feats_te].fillna(0).values))[:, 1])), 3)
    overfit_gap = round(auc_random - auc_temporal, 3)
    print(f"[train] C={best_c} 随机AUC={auc_random}  时间外AUC={auc_temporal:.3f}  GB时间外AUC={auc_gb}  "
          f"过拟合差={overfit_gap}  基准={base}%  Top20={top['top20']}%")

    # 滚动时间外(辅助稳健指标): 多 fold 平均 AUC/Top20
    _, wf_agg = walk_forward(df, n_folds=4, C_=best_c)
    wf_note = ""
    if wf_agg:
        wf_note = f"  WF({wf_agg['n_folds']}folds) AUC={wf_agg['auc_wf']} Top20={wf_agg['top20_wf']}%"
        print(f"[train] 滚动时间外评估: {wf_note.lstrip()}")
    else:
        wf_agg = {}

    # 真实 T+3 结果回馈(进化轨迹中的真实世界指标)
    realized = realized_summary()
    if realized:
        print(f"[train] 真实结果回馈(近{REALIZED_WINDOW}个已验证日): "
              f"{realized['days']}日内 {realized['n']} 条: T1命中 {realized['t1_hit']}% / T3命中 {realized['t3_hit']}%")

    # 全量模型（LR vs GBDT 时间外择优：GB 样本充足时更准，稀疏时回落 LR）
    m_full, sc_full, feats_full, coef, n, pos, wsum, model_kind = train_full(df, best_c)
    gb_auc_on_te = _gb_auc_on(tr, te, feats_full, best_c)
    lr_auc_on_te = auc_temporal  # evaluate() 已算的 LR 时间外 AUC
    if gb_auc_on_te is not None and gb_auc_on_te > lr_auc_on_te + 0.005 and len(df) >= 300:
        # GB 明显更优且样本充足 → 用 GB 作生产模型
        sc_gb = StandardScaler().fit(d_all[feats_full].fillna(0).values)
        m_gb = GradientBoostingClassifier(random_state=42)
        m_gb.fit(sc_gb.transform(d_all[feats_full].fillna(0).values), ya,
                 sample_weight=_time_weights(df))
        m_full, sc_full, model_kind, coef = m_gb, sc_gb, "gb", None
        print(f"[train] 模型择优: GBDT 时间外AUC {gb_auc_on_te:.3f} > LR {lr_auc_on_te:.3f}, 采用 GBDT")
    else:
        print(f"[train] 模型择优: 采用 LR（LR时间外AUC {lr_auc_on_te:.3f}"
              f"{', GB '+format(gb_auc_on_te,'.3f') if gb_auc_on_te is not None else ''}，GB优势不足或样本不足）")
    if coef is not None:
        coef.to_csv(os.path.join(C.DATA, "model_coef_t3.csv"), index=False, encoding="utf-8-sig")
    new_art = {"model": m_full, "scaler": sc_full, "feats": feats_full,
               "cat_cols": [c for c in feats_full if c.startswith(CAT + "_")],
               "model_kind": model_kind,
               "auc_random": auc_random, "auc_temporal": auc_temporal, "auc_gb": auc_gb,
               "wf": wf_agg, "wsum": round(float(wsum), 1),
               "n": n, "pos_rate": pos}

    # 版本决策: 与当前模型在【同一时间外测试集】上比较 + 防过拟合(walk-forward)兜底
    history = []
    if os.path.exists(C.HISTORY_PATH):
        try:
            history = json.load(open(C.HISTORY_PATH, encoding="utf-8"))
        except Exception:
            history = []
    cur_ver = history[-1]["version"] if history else 0
    # 同协议比较: 新旧都用「全量模型」在当前时间外测试集 te 上的 AUC
    new_full_auc = _auc_on(new_art, te)
    old_auc = _auc_on(C.load_model(), te)
    new_wf_auc = wf_agg.get("auc_wf")
    old_wf_auc = (history[-1].get("wf") or {}).get("auc_wf") if history else None
    accepted = True
    note = "首次训练" if not history else ""
    if old_auc is None:
        if os.path.exists(C.MODEL_META):
            note = "旧模型缺失/不可比, 视为首次接受"
        else:
            note = note or "首次训练"
    elif new_full_auc is None:
        accepted = False
        note = "新模型评估失败, 保留旧模型"
    else:
        if new_full_auc < old_auc - ACCEPT_TOL:
            accepted = False
            note = f"同测试集 AUC {new_full_auc:.3f} < 旧模型 {old_auc:.3f}, 保留旧模型"
        elif new_wf_auc is not None and old_wf_auc is not None and new_wf_auc < old_wf_auc - WF_TOL:
            accepted = False
            note = (f"同测试集AUC持平但 WF回归 {new_wf_auc:.3f} < 旧WF {old_wf_auc:.3f}, "
                    f"疑似尾部窗口过拟合, 保留旧模型")
        else:
            note = f"同测试集 AUC {new_full_auc:.3f} ≥ 旧模型 {old_auc:.3f}, 接受新模型"

    if accepted or force:
        joblib.dump(new_art, C.MODEL_PATH)
        json.dump({"n": n, "pos_rate": round(pos * 100, 1), "auc_random": auc_random,
                   "auc_temporal": round(auc_temporal, 3), "auc_gb": auc_gb,
                   "model_kind": model_kind, "C": best_c, "wf": wf_agg,
                   "wsum": round(float(wsum), 1),
                   "overfit_gap": overfit_gap, "realized": realized,
                   "feats": feats_full, "coef": (coef.round(4).to_dict("records") if coef is not None else []),
                   "temporal_top": top, "temporal_base": base,
                   "temporal_test_dates": [te["TRADE_DATE"].min(), te["TRADE_DATE"].max()]},
                  open(C.MODEL_META, "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
    new_ver = cur_ver + (1 if accepted else 0)
    rec = {"version": new_ver, "date": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M"),
           "n": n, "pos_rate": round(pos * 100, 1), "wsum": round(float(wsum), 1),
           "model_kind": model_kind,
           "auc_random": auc_random, "auc_temporal": round(auc_temporal, 3),
           "auc_gb": auc_gb, "C": best_c, "overfit_gap": overfit_gap,
           "full_te_auc": new_full_auc, "old_auc": old_auc, "top20": top["top20"], "base": base,
           "wf": wf_agg, "realized": realized,
           "accepted": accepted, "note": note}
    history.append(rec)
    json.dump(history, open(C.HISTORY_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=str)
    print(f"[train] 版本 {new_ver} {'已接受' if accepted else '未接受(保留v'+str(cur_ver)+')'}  -> model_history 共 {len(history)} 条")
    return rec


if __name__ == "__main__":
    import sys
    main(force=("--force" in sys.argv))