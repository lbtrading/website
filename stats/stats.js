(function () {
  const DASH = "—";

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function asNumber(raw) {
    if (raw === null || raw === undefined) return NaN;
    const s = String(raw).trim();
    if (!s || s === "-" || s === "—") return NaN;
    return Number(s);
  }

  function displayValue(raw, formatter) {
    const n = asNumber(raw);
    return Number.isFinite(n) ? formatter(n) : DASH;
  }

  function toMoney(n) {
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function toStr(n) {
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  const nfCompact = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2
  });

  const nfUsdCompact = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function fmtIndex(raw) {
    const n = asNumber(raw);
    return Number.isFinite(n)
      ? n.toLocaleString("en-US", {
          minimumFractionDigits: 4,
          maximumFractionDigits: 4
        })
      : DASH;
  }

  function fmtDate(iso) {
    const p = (iso ?? "").split("-");
    if (p.length !== 3) return iso ?? DASH;
    return `${p[1]}-${p[2]}-${p[0].slice(2)}`;
  }

  function csvCell(raw, formatter) {
    const n = asNumber(raw);
    return Number.isFinite(n) ? formatter(n) : DASH;
  }

  function applyMetrics(data) {
    setText("volContracts", displayValue(data.volume_contracts, toStr));
    setText("volUsd", displayValue(data.volume_usd, toMoney));
    setText("trades", displayValue(data.trades, toStr));

    setText("revenue", displayValue(data.revenue, toMoney));
    setText("fees", displayValue(data.fees, toMoney));
    setText("profit", displayValue(data.profit, toMoney));

    setText("interest", displayValue(data.interest, toMoney));
    setText("rebate", displayValue(data.rebate, toMoney));
    setText("incentive", displayValue(data.incentive, toMoney));

    setText("sharpe", displayValue(data.sharpe_ratio, toStr));
  }

  async function loadStats(jsonPath) {
    const res = await fetch(`${jsonPath}?bust=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);

    const data = await res.json();
    applyMetrics(data);

    const lastMod = res.headers.get("Last-Modified");
    setText("updated", `Updated: ${lastMod ? lastMod.replace("GMT", "UTC") : DASH}`);
  }

  async function loadHistory(csvPath) {
    const res = await fetch(`${csvPath}?bust=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status + " " + res.statusText);

    const text = (await res.text()).trim();
    const lines = text.split(/\r?\n/);
    const header = lines.shift().split(",").map(s => s.trim());
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));
    const rows = lines.filter(l => l && l.trim()).map(l => l.split(","));

    setText("daysTrading", rows.length.toLocaleString("en-US"));

    rows.sort((a, b) => (a[idx.date] ?? "").localeCompare(b[idx.date] ?? ""));

    let firstRecordedNav = NaN;
    for (let i = 0; i < rows.length; i++) {
      const nav = asNumber(rows[i][idx.net_asset_value]);
      if (Number.isFinite(nav) && nav !== 0) {
        firstRecordedNav = nav;
        break;
      }
    }

    let latestRecordedNav = NaN;
    for (let i = rows.length - 1; i >= 0; i--) {
      const nav = asNumber(rows[i][idx.net_asset_value]);
      if (Number.isFinite(nav)) {
        latestRecordedNav = nav;
        break;
      }
    }

    const pct = (
      Number.isFinite(firstRecordedNav) &&
      Number.isFinite(latestRecordedNav)
    )
      ? ((latestRecordedNav / firstRecordedNav) - 1) * 100
      : NaN;

    setText(
      "pctReturn",
      Number.isFinite(pct)
        ? `${pct.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}%`
        : DASH
    );

    rows.sort((a, b) => (b[idx.date] ?? "").localeCompare(a[idx.date] ?? ""));

    let out = "";
    for (const r of rows) {
      out += `
        <div class="hrow">
          <div class="cell">${fmtDate((r[idx.date] ?? "").trim())}</div>
          <div class="cell">${fmtIndex(r[idx.net_asset_value])}</div>
          <div class="cell">${csvCell(r[idx.volume_contracts], x => nfCompact.format(x))}</div>
          <div class="cell">${csvCell(r[idx.volume_usd], x => nfUsdCompact.format(x))}</div>
          <div class="cell">${csvCell(r[idx.trades], x => nfCompact.format(x))}</div>
          <div class="cell">${csvCell(r[idx.revenue_usd], x => nfUsdCompact.format(x))}</div>
          <div class="cell">${csvCell(r[idx.fees_usd], x => nfUsdCompact.format(x))}</div>
          <div class="cell">${csvCell(r[idx.profit_usd], x => nfUsdCompact.format(x))}</div>
        </div>
      `;
    }

    document.getElementById("historyRows").innerHTML = out;
  }

  async function initStatsPage(config) {
    try {
      await loadStats(config.jsonPath);
    } catch (error) {
      console.error("json load error", error);
      setText("updated", "Updated: —");
    }

    try {
      await loadHistory(config.csvPath);
    } catch (error) {
      console.error("csv load error", error);
      document.getElementById("historyRows").innerHTML =
        `<div class="hrow"><div class="cell" style="grid-column:1/-1;">failed to load history</div></div>`;
    }
  }

  window.initStatsPage = initStatsPage;
})();
