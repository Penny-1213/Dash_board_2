import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.linear_model import Ridge

# =========================================================
# Dashboard data generator — Professor's requested version
# =========================================================
# 1. Fixed study period comes from the CSV automatically.
# 2. Select 50 companies by latest market capitalization.
# 3. Return-Risk uses annualized compounded return + volatility.
# 4. PCA uses historical daily log-return patterns.
# 5. Ridge predicts FUTURE CUMULATIVE LOG RETURN for:
#       1D, 5D, 10D, 20D, 1Q(63D), 0.5Y(126D), 1Y(252D)
#
# NOTE:
# This is a Dashboard prototype model. It uses the available
# historical return data and 5 lagged daily returns as features.
# Replace the feature block later with the project's final
# numerical/news feature set when the research model is complete.
# =========================================================

BASE_DIR = Path(__file__).resolve().parent
CSV_FILE = BASE_DIR / "Stock_combined.csv"
OUTPUT_FILE = BASE_DIR / "data.json"

PREDICTION_HORIZONS = {
    "1D": 1,
    "5D": 5,
    "10D": 10,
    "20D": 20,
    "1Q": 63,
    "0.5Y": 126,
    "1Y": 252,
}

N_STOCKS = 50
RIDGE_ALPHA = 1.0
N_LAGS = 5

# ---------------------------------------------------------
# Company metadata used by the current Dashboard prototype.
# Add more companies here as needed.
# ---------------------------------------------------------
COMPANY_INFO = {
    1101: {"name": "台泥", "industry": "水泥工業", "domain": "taiwancement.com"},
    1102: {"name": "亞泥", "industry": "水泥工業", "domain": "acc.com.tw"},
    1216: {"name": "統一", "industry": "食品工業", "domain": "uni-president.com.tw"},
    1301: {"name": "台塑", "industry": "塑膠工業", "domain": "fcfc.com.tw"},
    1303: {"name": "南亞", "industry": "塑膠工業", "domain": "nan ya.com.tw"},
    2308: {"name": "台達電", "industry": "電子零組件", "domain": "deltaww.com"},
    2317: {"name": "鴻海", "industry": "其他電子", "domain": "foxconn.com"},
    2330: {"name": "台積電", "industry": "半導體", "domain": "tsmc.com"},
    2454: {"name": "聯發科", "industry": "半導體", "domain": "mediatek.com"},
    2881: {"name": "富邦金", "industry": "金融保險", "domain": "fubon.com"},
    2882: {"name": "國泰金", "industry": "金融保險", "domain": "cathayholdings.com"},
}


def safe_float(value, default=0.0):
    """Convert a value to float without allowing NaN/inf into JSON."""
    try:
        value = float(value)
        return value if np.isfinite(value) else default
    except (TypeError, ValueError):
        return default


def get_company_info(stock):
    stock_int = int(stock)
    return COMPANY_INFO.get(
        stock_int,
        {
            "name": f"股票 {stock_int}",
            "industry": "上市企業",
            "domain": None,
        },
    )


def build_future_cumulative_log_return(log_return, horizon):
    """
    Future cumulative log return from t+1 through t+horizon.

    If r_t is today's log return, the target at t is:
        r_(t+1) + ... + r_(t+horizon)

    This is the correct forward cumulative-return target for a
    multi-day prediction horizon when the source column is log return.
    """
    future_sum = log_return.shift(-1).rolling(horizon).sum().shift(-(horizon - 1))
    return future_sum


def select_50_stocks(df):
    """
    Select 50 companies using latest-date market capitalization.

    This makes the Dashboard's 50-company universe deterministic and
    transparent. It is NOT a reconstruction of historical 0050 membership.
    """
    latest_date = df["Date"].max()
    latest = df[df["Date"] == latest_date].copy()

    latest["Market_Cap"] = latest["Close"] * latest["Outstanding_Shares"]
    latest = latest.replace([np.inf, -np.inf], np.nan)
    latest = latest.dropna(subset=["Market_Cap"])
    latest = latest.drop_duplicates(subset=["Stock"])

    selected = (
        latest.sort_values("Market_Cap", ascending=False)
        .head(N_STOCKS)["Stock"]
        .tolist()
    )

    return selected, latest_date


def calculate_ridge_predictions(stock_df):
    """Train one Ridge model per horizon for one stock."""
    stock_df = stock_df.sort_values("Date").copy()
    stock_df["Return_Ln"] = pd.to_numeric(stock_df["Return_Ln"], errors="coerce")
    stock_df = stock_df.dropna(subset=["Return_Ln"])

    # Five lagged daily returns = prototype feature set.
    for lag in range(1, N_LAGS + 1):
        stock_df[f"Lag_{lag}"] = stock_df["Return_Ln"].shift(lag)

    feature_cols = [f"Lag_{lag}" for lag in range(1, N_LAGS + 1)]
    predictions = {}

    for horizon_name, horizon_days in PREDICTION_HORIZONS.items():
        target_col = f"Target_{horizon_name}"
        stock_df[target_col] = build_future_cumulative_log_return(
            stock_df["Return_Ln"], horizon_days
        )

        train_data = stock_df.dropna(subset=feature_cols + [target_col])

        if len(train_data) < 50:
            predictions[horizon_name] = 0.0
            continue

        X = train_data[feature_cols]
        y = train_data[target_col]

        model = Ridge(alpha=RIDGE_ALPHA)
        model.fit(X, y)

        # Predict from the latest available lagged-return vector.
        latest_features = stock_df[feature_cols].dropna().tail(1)
        if latest_features.empty:
            predictions[horizon_name] = 0.0
            continue

        pred_log_return = model.predict(latest_features)[0]

        # Dashboard displays percentage return, not log-return units.
        predicted_simple_return = np.expm1(pred_log_return) * 100
        predictions[horizon_name] = round(safe_float(predicted_simple_return), 4)

    return predictions


def main():
    print("🚀 Reading Stock_combined.csv...")
    df = pd.read_csv(CSV_FILE)

    required_cols = {
        "Stock",
        "Date",
        "Close",
        "Outstanding_Shares",
        "Return_Ln",
    }
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")

    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df["Stock"] = pd.to_numeric(df["Stock"], errors="coerce")
    df["Close"] = pd.to_numeric(df["Close"], errors="coerce")
    df["Outstanding_Shares"] = pd.to_numeric(
        df["Outstanding_Shares"], errors="coerce"
    )
    df["Return_Ln"] = pd.to_numeric(df["Return_Ln"], errors="coerce")
    # Return_Ln in Stock_combined.csv is expressed in percentage points.
    # Convert once here to decimal log-return for all calculations.
    df["Return_Ln"] = df["Return_Ln"] / 100.0

    df = df.dropna(subset=["Stock", "Date", "Return_Ln"])
    df["Stock"] = df["Stock"].astype(int)
    df = df.sort_values(["Stock", "Date"])

    # ---------------------------------------------------------
    # 1. Select the 50-company Dashboard universe.
    # ---------------------------------------------------------
    top_stocks, latest_date = select_50_stocks(df)

    if len(top_stocks) < N_STOCKS:
        raise ValueError(
            f"Only {len(top_stocks)} stocks have usable latest-date market-cap data; "
            f"cannot build the requested {N_STOCKS}-company Dashboard."
        )

    selected_df = df[df["Stock"].isin(top_stocks)].copy()

    print(f"✅ Selected {len(top_stocks)} companies by latest market cap.")
    print(
        f"📅 Study period: {selected_df['Date'].min():%Y-%m-%d} "
        f"to {selected_df['Date'].max():%Y-%m-%d}"
    )

    # ---------------------------------------------------------
    # 2. Return-Risk analysis.
    # ---------------------------------------------------------
    returns_pivot = selected_df.pivot_table(
        index="Date",
        columns="Stock",
        values="Return_Ln",
        aggfunc="mean",
    ).sort_index()

    # Do NOT fill missing observations with 0.
    # A missing stock-day is not the same as a 0% return.
    returns_pivot = returns_pivot.dropna(axis=1, how="all")

    # Expected annual simple return from mean daily log return.
    mean_daily_log_return = returns_pivot.mean(skipna=True)
    annual_returns = np.expm1(mean_daily_log_return * 252)

    # Annualized volatility of daily log returns.
    annual_volatility = returns_pivot.std(skipna=True, ddof=1) * np.sqrt(252)

    # ---------------------------------------------------------
    # 3. PCA on historical return patterns.
    # ---------------------------------------------------------
    print("📊 Running Stock Return PCA...")

    # Use each stock's mean-imputed return series only for PCA.
    # This is visualization-oriented; it is not the research model's
    # fold-local embedding PCA.
    pca_input = returns_pivot[top_stocks].copy()
    pca_input = pca_input.fillna(pca_input.mean())

    # Remove columns that still contain NaN (e.g. an entirely missing series).
    pca_input = pca_input.dropna(axis=1, how="any")
    pca_stocks = pca_input.columns.tolist()

    if len(pca_stocks) >= 2:
        pca = PCA(n_components=2)
        pca_features = pca.fit_transform(pca_input.T)
        pca_df = pd.DataFrame(
            pca_features,
            index=pca_stocks,
            columns=["PC1", "PC2"],
        )
        explained_variance = pca.explained_variance_ratio_.tolist()
    else:
        pca_df = pd.DataFrame(columns=["PC1", "PC2"])
        explained_variance = [0.0, 0.0]

    # ---------------------------------------------------------
    # 4. Ridge predictions for all seven horizons.
    # ---------------------------------------------------------
    print("🤖 Running Ridge regression for 7 prediction horizons...")
    predictions = {}

    for i, stock in enumerate(top_stocks, start=1):
        stock_df = selected_df[selected_df["Stock"] == stock].copy()
        predictions[stock] = calculate_ridge_predictions(stock_df)
        print(f"   [{i:02d}/{len(top_stocks)}] {stock} done")

    # ---------------------------------------------------------
    # 5. Build company metadata + Dashboard JSON.
    # ---------------------------------------------------------
    latest_df = selected_df[selected_df["Date"] == latest_date].copy()
    latest_df = latest_df.drop_duplicates(subset=["Stock"])
    latest_lookup = latest_df.set_index("Stock")

    output_companies = []

    for stock in top_stocks:
        info = get_company_info(stock)

        if stock in latest_lookup.index:
            row = latest_lookup.loc[stock]
            close_price = safe_float(row.get("Close"), np.nan)
            shares = safe_float(row.get("Outstanding_Shares"), np.nan)

            if np.isfinite(close_price) and np.isfinite(shares):
                market_cap_100m = close_price * shares / 1e8
                market_cap_str = f"{market_cap_100m:,.2f} 億"
            else:
                market_cap_str = "N/A"
        else:
            market_cap_str = "N/A"

        expected_return = safe_float(annual_returns.get(stock), 0.0) * 100
        volatility = safe_float(annual_volatility.get(stock), 0.0) * 100

        if stock in pca_df.index:
            pc1 = safe_float(pca_df.loc[stock, "PC1"])
            pc2 = safe_float(pca_df.loc[stock, "PC2"])
        else:
            pc1 = pc2 = 0.0

        logo = (
            f"https://logo.clearbit.com/{info['domain']}"
            if info.get("domain")
            else ""
        )

        output_companies.append(
            {
                "ticker": str(stock),
                "full_ticker": f"{stock}.TW",
                "name": info["name"],
                "industry": info["industry"],
                "market_cap": market_cap_str,
                "logo": logo,
                "return_risk": {
                    "expected_return": round(expected_return, 2),
                    "volatility": round(volatility, 2),
                },
                "pca": {
                    "pc1": round(pc1, 4),
                    "pc2": round(pc2, 4),
                },
                "predictions": predictions[stock],
            }
        )

    final_json = {
        "study_period": (
            f"{selected_df['Date'].min():%Y-%m-%d} to "
            f"{selected_df['Date'].max():%Y-%m-%d}"
        ),
        "data_source": "Stock_combined.csv",
        "universe_definition": "Top 50 companies by latest market capitalization",
        "model": {
            "name": "Ridge Regression",
            "alpha": RIDGE_ALPHA,
            "features": [f"Lag_{i}" for i in range(1, N_LAGS + 1)],
            "target_definition": "Future cumulative log return converted to simple return",
            "prototype": True,
        },
        "prediction_horizons": PREDICTION_HORIZONS,
        "pca": {
            "type": "Stock Return PCA",
            "explained_variance_ratio": [round(x, 6) for x in explained_variance],
        },
        "total_companies": len(output_companies),
        "companies": output_companies,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(final_json, f, ensure_ascii=False, indent=2, allow_nan=False)

    print(f"🎉 Generated: {OUTPUT_FILE}")
    print(f"   Companies: {len(output_companies)}")
    print(f"   Horizons: {', '.join(PREDICTION_HORIZONS.keys())}")


if __name__ == "__main__":
    main()
