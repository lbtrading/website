(() => {
  "use strict";
  const VENUES = [
    { id: "kalshi", name: "Kalshi", file: "kalshi" },
    { id: "polymarket", name: "Polymarket", file: "polymarket" },
    { id: "polymarket-us", name: "Polymarket US", file: "polymarket_us" },
    { id: "prophetx", name: "ProphetX", file: "prophetx" },
    { id: "novig", name: "Novig", file: "novig" },
  ];
  const number = (value) =>
    value === null ||
    value === undefined ||
    String(value).trim() === "" ||
    !Number.isFinite(Number(value))
      ? NaN
      : Number(value);
  const fmt = (value, type = "number", compact = false) => {
    const n = number(value);
    if (!Number.isFinite(n)) return "—";
    return new Intl.NumberFormat("en-US", {
      ...(type === "money" ? { style: "currency", currency: "USD" } : {}),
      ...(compact ? { notation: "compact" } : {}),
      minimumFractionDigits:
        type === "money" || type === "ratio" ? 2 : type === "index" ? 4 : 0,
      maximumFractionDigits:
        type === "index" ? 4 : type === "trades" && !compact ? 0 : 2,
    }).format(n);
  };
  const sign = (value) =>
    number(value) > 0 ? "positive" : number(value) < 0 ? "negative" : "";
  const date = (iso) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    });
  const sum = (values) =>
    values.every((v) => Number.isFinite(number(v)))
      ? values.reduce((a, b) => a + number(b), 0)
      : NaN;
  const rewards = (data) =>
    sum([
      data.incentive,
      data.rebate,
      data.bonus_rebate === undefined ? 0 : data.bonus_rebate,
    ]);
  const returnOf = (rows) => {
    const first = rows.find(
      (r) => Number.isFinite(r.net_asset_value) && r.net_asset_value !== 0,
    );
    const last = [...rows]
      .reverse()
      .find((r) => Number.isFinite(r.net_asset_value));
    return first && last
      ? (last.net_asset_value / first.net_asset_value - 1) * 100
      : NaN;
  };
  function parseCSV(text) {
    const [header, ...lines] = text.trim().split(/\r?\n/);
    const keys = header.split(",").map((s) => s.trim());
    return lines
      .filter((line) => line.trim())
      .map((line) =>
        Object.fromEntries(
          line
            .split(",")
            .map((v, i) => [
              keys[i],
              keys[i] === "date" ? v.trim() : number(v),
            ]),
        ),
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  async function load(venue) {
    const responses = await Promise.all(
      ["json", "csv"].map((ext) =>
        fetch(`/stats/${venue.file}_stats.${ext}?bust=${Date.now()}`, {
          cache: "no-store",
        }),
      ),
    );
    return {
      ...venue,
      data: responses[0].ok ? await responses[0].json() : null,
      rows: responses[1].ok ? parseCSV(await responses[1].text()) : null,
      modified: responses[0].headers.get("Last-Modified"),
    };
  }
  function kpi(label, value, type, colored = false) {
    return `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value ${colored ? sign(value) : ""}" title="${fmt(value, type)}">${fmt(value, type, type !== "ratio")}${type === "ratio" && label === "Return" && Number.isFinite(value) ? "%" : ""}</div></div>`;
  }
  function chartPanel(id, heading, filters = false) {
    return `<section class="chart-panel" aria-labelledby="${id}-heading"><div class="section-bar"><div><h2 id="${id}-heading">${heading}</h2></div>${filters ? '<div class="filters" role="group" aria-label="History date range"><button data-range="30" aria-pressed="false">30D</button><button data-range="90" aria-pressed="false">90D</button><button data-range="all" aria-pressed="true">All</button></div>' : ""}</div><div class="chart-readout" id="${id}-readout" aria-live="polite"></div><svg id="${id}" class="chart" role="img" tabindex="0" aria-label="${heading}. Use left and right arrow keys to inspect dated values."></svg></section>`;
  }
  function renderChart(id, rows, field, bars = false) {
    const svg = document.getElementById(id);
    const readout = document.getElementById(`${id}-readout`);
    const valid = rows.filter((r) => Number.isFinite(r[field]));
    if (!valid.length) {
      svg.innerHTML = "";
      readout.textContent = "No reported profit in this range";
      return;
    }
    const width = Math.max(svg.clientWidth, 280),
      height = svg.clientHeight || 260;
    const left = 78,
      right = width - 12,
      top = 14,
      bottom = height - 28;
    const lo = Math.min(0, ...valid.map((r) => r[field])),
      hi = Math.max(0, ...valid.map((r) => r[field]));
    const roughStep = (hi - lo || 1) / 4;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const step =
      [1, 2, 2.5, 5, 10].find((n) => n * magnitude >= roughStep) * magnitude;
    const min = Math.floor(lo / step) * step;
    const max = Math.max(min + step, Math.ceil(hi / step) * step);
    const start = Date.parse(rows[0].date),
      end = Date.parse(rows.at(-1).date);
    const x = (r) =>
      left +
      ((Date.parse(r.date) - start) / (end - start || 1)) * (right - left);
    const y = (n) => bottom - ((n - min) / (max - min)) * (bottom - top);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    let markup = "<title>Reported profit history in US dollars</title>";
    for (let n = min; n <= max + step / 100; n += step) {
      markup += `<line class="grid" x1="${left}" y1="${y(n)}" x2="${right}" y2="${y(n)}"/><text x="${left - 10}" y="${y(n) + 4}" text-anchor="end">${fmt(n, "money", true)}</text>`;
    }
    if (bars) {
      const barWidth = Math.max(
        0.7,
        Math.min(12, ((right - left) / rows.length) * 0.7),
      );
      markup += valid
        .map(
          (r) =>
            `<rect x="${x(r) - barWidth / 2}" y="${Math.min(y(r[field]), y(0))}" width="${barWidth}" height="${Math.max(1, Math.abs(y(r[field]) - y(0)))}" fill="${r[field] < 0 ? "var(--negative)" : "var(--positive)"}" opacity=".8"/>`,
        )
        .join("");
    } else {
      let d = "",
        connected = false;
      rows.forEach((r) => {
        if (Number.isFinite(r[field])) {
          d += `${connected ? "L" : "M"}${x(r)},${y(r[field])} `;
          connected = true;
        } else connected = false;
      });
      markup += `<path class="profit-line" d="${d}"/>`;
      if (valid.length === 1)
        markup += `<circle cx="${x(valid[0])}" cy="${y(valid[0][field])}" r="3" fill="var(--positive)"/>`;
    }
    markup += `<text x="${left}" y="${height - 5}">${date(rows[0].date)}</text><text x="${right}" y="${height - 5}" text-anchor="end">${date(rows.at(-1).date)}</text><line class="crosshair" id="${id}-cursor" y1="${top}" y2="${bottom}" hidden/>`;
    svg.innerHTML = markup;
    let selected = rows.length - 1;
    function inspect(index) {
      selected = index;
      const row = rows[index],
        value = row[field];
      readout.innerHTML = `<strong class="${sign(value)}">${fmt(value, "money")}</strong><span>${date(row.date)}${row.partial ? " · Partial coverage" : ""}</span>`;
      const cursor = document.getElementById(`${id}-cursor`);
      cursor.setAttribute("x1", x(row));
      cursor.setAttribute("x2", x(row));
      cursor.removeAttribute("hidden");
    }
    svg.onpointermove = (event) => {
      const rect = svg.getBoundingClientRect(),
        px = ((event.clientX - rect.left) / rect.width) * width;
      const targetDate =
        start +
        Math.max(0, Math.min(1, (px - left) / (right - left))) * (end - start);
      let nearest = 0;
      rows.forEach((r, i) => {
        if (
          Math.abs(Date.parse(r.date) - targetDate) <
          Math.abs(Date.parse(rows[nearest].date) - targetDate)
        )
          nearest = i;
      });
      inspect(nearest);
    };
    svg.onpointerleave = () => inspect(rows.length - 1);
    svg.onkeydown = (event) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        inspect(
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? rows.length - 1
              : Math.max(
                  0,
                  Math.min(
                    rows.length - 1,
                    selected + (event.key === "ArrowLeft" ? -1 : 1),
                  ),
                ),
        );
      }
    };
    inspect(selected);
  }
  function cumulative(rows) {
    let total = 0;
    return rows.map((r) => {
      const present = Number.isFinite(r.profit_usd);
      if (present) total += r.profit_usd;
      return { ...r, cumulative: present ? total : NaN };
    });
  }
  function consolidated(venues) {
    const days = new Map();
    venues.forEach((v) =>
      v.rows?.forEach((r) => {
        if (!days.has(r.date))
          days.set(r.date, { date: r.date, profits: [], partial: false });
        const day = days.get(r.date);
        if (Number.isFinite(r.profit_usd)) day.profits.push(r.profit_usd);
        else day.partial = true;
      }),
    );
    return cumulative(
      [...days.values()]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((day) => ({
          ...day,
          profit_usd: day.profits.length ? sum(day.profits) : NaN,
        })),
    );
  }
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  async function init() {
    const id = document.body.dataset.venue;
    const overview = id === "overview";
    const selectedVenues = overview
      ? VENUES
      : VENUES.filter((v) => v.id === id);
    const results = await Promise.allSettled(selectedVenues.map(load));
    const venues = results.map((result, i) =>
      result.status === "fulfilled"
        ? result.value
        : { ...selectedVenues[i], data: null, rows: null },
    );
    const status = document.getElementById("load-status");
    const failed = venues.filter((v) => !v.data || !v.rows);
    status.hidden = !failed.length;
    status.textContent = failed.length
      ? `Some source files could not be loaded (${failed.map((v) => v.name).join(", ")}). Unavailable metrics are shown as —; history may be incomplete. Reload to retry.`
      : "";
    const aggregate = (key) => sum(venues.map((v) => v.data?.[key]));
    const data = overview
      ? {
          profit: aggregate("profit"),
          volume_usd: aggregate("volume_usd"),
          trades: aggregate("trades"),
          volume_contracts: aggregate("volume_contracts"),
          rewards: sum(venues.map((v) => (v.data ? rewards(v.data) : NaN))),
        }
      : venues[0].data || {};
    const venue = venues[0];
    const history = overview
      ? consolidated(venues)
      : cumulative(venue.rows || []);
    const latest = history.at(-1)?.date;
    document.getElementById("asof").innerHTML = latest
      ? `<strong>Data through ${date(latest)}</strong>`
      : "History unavailable";
    const dashboard = document.getElementById("dashboard");
    dashboard.hidden = false;
    dashboard.innerHTML = `<section aria-labelledby="headline-heading"><div class="section-bar"><h2 id="headline-heading">${overview ? "Firm-wide performance" : "Headline performance"}</h2><span class="period-label">All-time · USD</span></div><div class="kpi-grid">${kpi("Net profit", data.profit, "money", true)}${kpi("Trading volume", data.volume_usd, "money")}${kpi("Total trades", data.trades, "trades")}${overview ? kpi("Contract volume", data.volume_contracts, "number") + kpi("Incentives & rebates", data.rewards, "money") + kpi("Trading venues", venues.filter((v) => v.data).length, "trades") : kpi("Return", returnOf(venue.rows || []), "ratio", true) + kpi("Sharpe ratio", data.sharpe_ratio, "ratio") + kpi("Incentives & rebates", venue.data ? rewards(data) : NaN, "money")}</div></section>
      ${chartPanel("cumulative", "Cumulative P&L", true)}
      ${overview ? renderComparison(venues) : `<div class="two-column">${chartPanel("daily", "Daily net profit")}${renderBreakdown(data)}</div><section class="table-panel" aria-labelledby="daily-heading"><div class="section-bar"><div><h2 id="daily-heading">Daily results</h2><p id="table-range"></p></div></div><div class="table-scroll" tabindex="0" role="region" aria-label="Daily results, scroll horizontally for all metrics"><table><thead><tr>${["Date", "NAV index", "Contracts", "Volume · USD", "Trades", "Revenue · USD", "Fees · USD", "Net profit · USD"].map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody id="daily-rows"></tbody></table></div><div class="table-footer"><span id="table-count"></span><div class="pagination"><button id="prev">← Previous</button><button id="next">Next →</button></div></div></section>`}`;
    let range = "all",
      page = 0,
      filtered = history;
    function renderTable() {
      if (overview) return;
      const rows = [...filtered].reverse(),
        size = 25;
      const start = page * size,
        subset = rows.slice(start, start + size);
      document.getElementById("daily-rows").innerHTML = subset.length
        ? subset
            .map(
              (r) =>
                `<tr><th scope="row">${escape(r.date)}</th>${[
                  ["net_asset_value", "index"],
                  ["volume_contracts", "number"],
                  ["volume_usd", "money"],
                  ["trades", "trades"],
                  ["revenue_usd", "money"],
                  ["fees_usd", "money"],
                  ["profit_usd", "money"],
                ]
                  .map(
                    ([key, type]) =>
                      `<td class="${key === "profit_usd" || key === "revenue_usd" ? sign(r[key]) : ""}">${fmt(r[key], type)}</td>`,
                  )
                  .join("")}</tr>`,
            )
            .join("")
        : '<tr><td colspan="8">No history available.</td></tr>';
      document.getElementById("table-count").textContent = rows.length
        ? `${start + 1}–${Math.min(start + size, rows.length)} of ${rows.length} reporting days · Newest first`
        : "0 reporting days";
      document.getElementById("table-range").textContent = rows.length
        ? `${date(filtered[0].date)} – ${date(filtered.at(-1).date)}`
        : "History unavailable";
      document.getElementById("prev").disabled = page === 0;
      document.getElementById("next").disabled = start + size >= rows.length;
    }
    function update() {
      const cutoff = latest
        ? Date.parse(latest) - (Number(range) - 1) * 86400000
        : 0;
      filtered =
        range === "all"
          ? history
          : history.filter((r) => Date.parse(r.date) >= cutoff);
      renderChart("cumulative", filtered, "cumulative");
      if (!overview) {
        renderChart("daily", filtered, "profit_usd", true);
        renderTable();
      }
    }
    document.querySelectorAll("[data-range]").forEach((button) =>
      button.addEventListener("click", () => {
        range = button.dataset.range;
        page = 0;
        document
          .querySelectorAll("[data-range]")
          .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        update();
      }),
    );
    if (!overview) {
      document.getElementById("prev").onclick = () => {
        page--;
        renderTable();
      };
      document.getElementById("next").onclick = () => {
        page++;
        renderTable();
      };
    }
    let timer;
    window.addEventListener("resize", () => {
      clearTimeout(timer);
      timer = setTimeout(update, 120);
    });
    update();
  }
  function renderComparison(venues) {
    return `<section class="table-panel" aria-labelledby="venues-heading"><div class="section-bar"><div><h2 id="venues-heading">Performance by venue</h2></div><span class="period-label">${venues.length} venues</span></div><div class="table-scroll" tabindex="0" role="region" aria-label="Venue comparison, scroll horizontally for all metrics"><table><thead><tr>${["Trading venue", "Net profit · USD", "Volume · USD", "Trades", "Return", "Sharpe", "Incentives & rebates · USD"].map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${[
      ...venues,
    ]
      .sort(
        (a, b) => (number(b.data?.profit) || 0) - (number(a.data?.profit) || 0),
      )
      .map(
        (v) =>
          `<tr><th scope="row"><a class="venue-name" href="/stats/${v.id}">${v.name}<span aria-hidden="true">↗</span></a></th><td class="${sign(v.data?.profit)}">${fmt(v.data?.profit, "money")}</td><td>${fmt(v.data?.volume_usd, "money")}</td><td>${fmt(v.data?.trades, "trades")}</td><td class="${sign(returnOf(v.rows || []))}">${fmt(returnOf(v.rows || []), "ratio")}${Number.isFinite(returnOf(v.rows || [])) ? "%" : ""}</td><td>${fmt(v.data?.sharpe_ratio, "ratio")}</td><td>${fmt(v.data ? rewards(v.data) : NaN, "money")}</td></tr>`,
      )
      .join("")}</tbody></table></div></section>`;
  }
  function renderBreakdown(data) {
    const entries = [
      ["Trading revenue", "revenue"],
      ["Fees (cost)", "fees"],
      ["Interest", "interest"],
      ["Rebates", "rebate"],
      ...(data.bonus_rebate === undefined
        ? []
        : [["Bonus rebates", "bonus_rebate"]]),
      ["Incentives", "incentive"],
    ];
    return `<section class="breakdown" aria-labelledby="breakdown-heading"><h2 id="breakdown-heading">Financial breakdown</h2><dl>${entries.map(([label, key]) => `<div><dt>${label}</dt><dd class="${key === "revenue" ? sign(data[key]) : ""}">${fmt(data[key], "money")}</dd></div>`).join("")}<div class="total"><dt>Reported net profit</dt><dd class="${sign(data.profit)}">${fmt(data.profit, "money")}</dd></div></dl></section>`;
  }
  init().catch((error) => {
    console.error("Performance dashboard load error", error);
    const status = document.getElementById("load-status");
    status.hidden = false;
    status.textContent =
      "Performance data could not be displayed. Reload to retry.";
  });
})();
